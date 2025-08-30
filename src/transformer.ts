import ts from 'typescript'

import { constants } from './transformer.fixtures.js'
import {
  type SchemaType,
  type DecoratorInfo,
  type PropertyInfo,
} from './types.js'

/**
 * Configuration options for SchemaTransformer memory management
 */
interface TransformerOptions {
  /** Maximum number of schemas to cache before cleanup (default: 100) */
  maxCacheSize?: number
  /** Whether to automatically clean up cache (default: true) */
  autoCleanup?: boolean
}

/**
 * Transforms class-validator decorated classes into OpenAPI schema objects.
 * Analyzes TypeScript source files directly using the TypeScript compiler API.
 * Implemented as a singleton for performance optimization.
 *
 * @example
 * ```typescript
 * const transformer = SchemaTransformer.getInstance();
 * const schema = transformer.transform(User);
 * console.log(schema);
 * ```
 *
 * @public
 */
class SchemaTransformer {
  /**
   * Singleton instance
   * @private
   */
  private static instance: SchemaTransformer | null = null
  /**
   * TypeScript program instance for analyzing source files.
   * @private
   */
  private program: ts.Program

  /**
   * TypeScript type checker for resolving types.
   * @private
   */
  private checker: ts.TypeChecker

  /**
   * Cache for storing transformed class schemas to avoid reprocessing.
   * Key format: "fileName:className" for uniqueness across different files.
   * @private
   */
  private classCache = new Map<string, any>()

  /**
   * Maximum number of entries to keep in cache before cleanup
   * @private
   */
  private readonly maxCacheSize: number

  /**
   * Whether to automatically clean up cache
   * @private
   */
  private readonly autoCleanup: boolean

  /**
   * Set of file paths that have been loaded to avoid redundant processing
   * @private
   */
  private loadedFiles = new Set<string>()

  /**
   * Private constructor for singleton pattern.
   *
   * @param tsConfigPath - Optional path to a specific TypeScript config file
   * @param options - Configuration options for memory management
   * @throws {Error} When TypeScript configuration cannot be loaded
   * @private
   */
  private constructor(
    tsConfigPath: string = constants.TS_CONFIG_DEFAULT_PATH,
    options: TransformerOptions = {}
  ) {
    // Initialize configuration with defaults
    this.maxCacheSize = options.maxCacheSize ?? 100
    this.autoCleanup = options.autoCleanup ?? true

    const { config, error } = ts.readConfigFile(
      tsConfigPath || 'tsconfig.json',
      ts.sys.readFile
    )

    if (error) {
      console.log(
        new Error(`Error reading tsconfig file: ${error.messageText}`).message
      )
      throw new Error(`Error reading tsconfig file: ${error.messageText}`)
    }

    const { options: tsOptions, fileNames } = ts.parseJsonConfigFileContent(
      config,
      ts.sys,
      './'
    )

    this.program = ts.createProgram(fileNames, tsOptions)
    this.checker = this.program.getTypeChecker()
  }

  /**
   * Generates a unique cache key using file name and class name.
   *
   * @param fileName - The source file name
   * @param className - The class name
   * @returns Unique cache key in format "fileName:className"
   * @private
   */
  private getCacheKey(fileName: string, className: string): string {
    return `${fileName}:${className}`
  }

  /**
   * Cleans up cache when it exceeds maximum size to prevent memory leaks.
   * Removes oldest entries using LRU strategy.
   * @private
   */
  private cleanupCache(): void {
    if (!this.autoCleanup || this.classCache.size <= this.maxCacheSize) {
      return
    }

    const entries = Array.from(this.classCache.entries())
    const toDelete = entries.slice(0, Math.floor(this.maxCacheSize / 2))

    for (const [key] of toDelete) {
      this.classCache.delete(key)
    }

    // Force garbage collection hint
    if (global.gc) {
      global.gc()
    }
  }

  /**
   * Gets relevant source files for a class, filtering out unnecessary files to save memory.
   *
   * @param className - The name of the class to find files for
   * @param filePath - Optional specific file path
   * @returns Array of relevant source files
   * @private
   */
  private getRelevantSourceFiles(
    className: string,
    filePath?: string
  ): ts.SourceFile[] {
    if (filePath) {
      const sourceFile = this.program.getSourceFile(filePath)
      return sourceFile ? [sourceFile] : []
    }

    // Only get source files that are not declaration files and not in node_modules
    return this.program.getSourceFiles().filter(sf => {
      if (sf.isDeclarationFile) return false
      if (sf.fileName.includes('.d.ts')) return false
      if (sf.fileName.includes('node_modules')) return false

      // Mark file as loaded for memory tracking
      this.loadedFiles.add(sf.fileName)

      return true
    })
  }

  /**
   * Transforms a class by its name into an OpenAPI schema object.
   * Now considers the context of the calling file to resolve ambiguous class names.
   *
   * @param className - The name of the class to transform
   * @param filePath - Optional path to the file containing the class
   * @param contextFile - Optional context file for resolving class ambiguity
   * @returns Object containing the class name and its corresponding JSON schema
   * @throws {Error} When the specified class cannot be found
   * @private
   */
  private transformByName(
    className: string,
    filePath?: string,
    contextFile?: string
  ): { name: string; schema: SchemaType } {
    const sourceFiles = this.getRelevantSourceFiles(className, filePath)

    // If we have a context file, try to find the class in that file first
    if (contextFile) {
      const contextSourceFile = this.program.getSourceFile(contextFile)
      if (contextSourceFile) {
        const classNode = this.findClassByName(contextSourceFile, className)
        if (classNode) {
          const cacheKey = this.getCacheKey(
            contextSourceFile.fileName,
            className
          )

          // Check cache first
          if (this.classCache.has(cacheKey)) {
            return this.classCache.get(cacheKey)!
          }

          const result = this.transformClass(classNode, contextSourceFile)
          this.classCache.set(cacheKey, result)
          this.cleanupCache()
          return result
        }
      }
    }

    // Fallback to searching all files, but prioritize files that are more likely to be relevant
    const prioritizedFiles = this.prioritizeSourceFiles(
      sourceFiles,
      contextFile
    )

    for (const sourceFile of prioritizedFiles) {
      const classNode = this.findClassByName(sourceFile, className)
      if (classNode && sourceFile?.fileName) {
        const cacheKey = this.getCacheKey(sourceFile.fileName, className)

        // Check cache first using fileName:className as key
        if (this.classCache.has(cacheKey)) {
          return this.classCache.get(cacheKey)!
        }

        const result = this.transformClass(classNode, sourceFile)

        // Cache using fileName:className as key for uniqueness
        this.classCache.set(cacheKey, result)

        // Clean up cache if it gets too large
        this.cleanupCache()

        return result
      }
    }

    throw new Error(`Class ${className} not found`)
  }

  /**
   * Prioritizes source files based on context to resolve class name conflicts.
   * Gives priority to files in the same directory or with similar names.
   *
   * @param sourceFiles - Array of source files to prioritize
   * @param contextFile - Optional context file for prioritization
   * @returns Prioritized array of source files
   * @private
   */
  private prioritizeSourceFiles(
    sourceFiles: ts.SourceFile[],
    contextFile?: string
  ): ts.SourceFile[] {
    if (!contextFile) {
      return sourceFiles
    }

    const contextDir = contextFile.substring(0, contextFile.lastIndexOf('/'))

    return sourceFiles.sort((a, b) => {
      const aDir = a.fileName.substring(0, a.fileName.lastIndexOf('/'))
      const bDir = b.fileName.substring(0, b.fileName.lastIndexOf('/'))

      // Prioritize files in the same directory as context
      const aInSameDir = aDir === contextDir ? 1 : 0
      const bInSameDir = bDir === contextDir ? 1 : 0

      if (aInSameDir !== bInSameDir) {
        return bInSameDir - aInSameDir // Higher priority first
      }

      // Prioritize non-test files over test files
      const aIsTest =
        a.fileName.includes('test') || a.fileName.includes('spec') ? 0 : 1
      const bIsTest =
        b.fileName.includes('test') || b.fileName.includes('spec') ? 0 : 1

      if (aIsTest !== bIsTest) {
        return bIsTest - aIsTest // Non-test files first
      }

      return 0
    })
  }

  /**
   * Gets the singleton instance of SchemaTransformer.
   *
   * @param tsConfigPath - Optional path to a specific TypeScript config file (only used on first call)
   * @param options - Configuration options for memory management (only used on first call)
   * @returns The singleton instance
   *
   * @example
   * ```typescript
   * const transformer = SchemaTransformer.getInstance();
   * ```
   *
   * @example
   * ```typescript
   * // With memory optimization options
   * const transformer = SchemaTransformer.getInstance('./tsconfig.json', {
   *   maxCacheSize: 50,
   *   autoCleanup: true
   * });
   * ```
   *
   * @public
   */
  /**
   * Clears the current singleton instance. Useful for testing or when you need
   * to create a new instance with different configuration.
   */
  public static clearInstance(): void {
    SchemaTransformer.instance = null
  }

  public static getInstance(
    tsConfigPath?: string,
    options?: TransformerOptions
  ): SchemaTransformer {
    if (!SchemaTransformer.instance) {
      SchemaTransformer.instance = new SchemaTransformer(tsConfigPath, options)
    }
    return SchemaTransformer.instance
  }

  /**
   * Transforms a class constructor function into an OpenAPI schema object.
   *
   * @param cls - The class constructor function to transform
   * @returns Object containing the class name and its corresponding JSON schema
   *
   * @example
   * ```typescript
   * import { User } from './entities/user.js';
   * const transformer = SchemaTransformer.getInstance();
   * const schema = transformer.transform(User);
   * ```
   *
   * @public
   */
  public transform(cls: Function): { name: string; schema: SchemaType } {
    return this.transformByName(cls.name)
  }

  /**
   * Clears all cached schemas and loaded file references to free memory.
   * Useful for long-running applications or when processing many different classes.
   *
   * @example
   * ```typescript
   * const transformer = SchemaTransformer.getInstance();
   * // After processing many classes...
   * transformer.clearCache();
   * ```
   *
   * @public
   */
  public clearCache(): void {
    this.classCache.clear()
    this.loadedFiles.clear()

    // Force garbage collection hint if available
    if (global.gc) {
      global.gc()
    }
  }

  /**
   * Gets memory usage statistics for monitoring and debugging.
   *
   * @returns Object containing cache size and loaded files count
   *
   * @example
   * ```typescript
   * const transformer = SchemaTransformer.getInstance();
   * const stats = transformer.getMemoryStats();
   * console.log(`Cache entries: ${stats.cacheSize}, Files loaded: ${stats.loadedFiles}`);
   * ```
   *
   * @public
   */
  public getMemoryStats(): { cacheSize: number; loadedFiles: number } {
    return {
      cacheSize: this.classCache.size,
      loadedFiles: this.loadedFiles.size,
    }
  }

  /**
   * Finds a class declaration by name within a source file.
   *
   * @param sourceFile - The TypeScript source file to search in
   * @param className - The name of the class to find
   * @returns The class declaration node if found, undefined otherwise
   * @private
   */
  private findClassByName(
    sourceFile: ts.SourceFile,
    className: string
  ): ts.ClassDeclaration | undefined {
    let result: ts.ClassDeclaration | undefined

    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name?.text === className) {
        result = node
        return
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    return result
  }

  /**
   * Transforms a TypeScript class declaration into a schema object.
   *
   * @param classNode - The TypeScript class declaration node
   * @param sourceFile - The source file containing the class (for context)
   * @returns Object containing class name and generated schema
   * @private
   */
  private transformClass(
    classNode: ts.ClassDeclaration,
    sourceFile?: ts.SourceFile
  ): {
    name: string
    schema: SchemaType
  } {
    const className = classNode.name?.text || 'Unknown'
    const properties = this.extractProperties(classNode)
    const schema = this.generateSchema(properties, sourceFile?.fileName)

    return { name: className, schema }
  }

  /**
   * Extracts property information from a class declaration.
   *
   * @param classNode - The TypeScript class declaration node
   * @returns Array of property information including names, types, decorators, and optional status
   * @private
   */
  private extractProperties(classNode: ts.ClassDeclaration): PropertyInfo[] {
    const properties: PropertyInfo[] = []

    for (const member of classNode.members) {
      if (
        ts.isPropertyDeclaration(member) &&
        member.name &&
        ts.isIdentifier(member.name)
      ) {
        const propertyName = member.name.text
        const type = this.getPropertyType(member)
        const decorators = this.extractDecorators(member)
        const isOptional = !!member.questionToken

        properties.push({
          name: propertyName,
          type,
          decorators,
          isOptional,
        })
      }
    }

    return properties
  }

  /**
   * Gets the TypeScript type of a property as a string.
   *
   * @param property - The property declaration to analyze
   * @returns String representation of the property's type
   * @private
   */
  private getPropertyType(property: ts.PropertyDeclaration): string {
    if (property.type) {
      return this.getTypeNodeToString(property.type)
    }

    const type = this.checker.getTypeAtLocation(property)
    return this.checker.typeToString(type)
  }

  /**
   * Resolves generic types by analyzing the type alias and its arguments.
   * For example, User<Role> where User is a type alias will be resolved to its structure.
   *
   * @param typeNode - The TypeScript type reference node with generic arguments
   * @returns String representation of the resolved type or schema
   * @private
   */
  private resolveGenericType(typeNode: ts.TypeReferenceNode): string {
    const typeName = (typeNode.typeName as ts.Identifier).text
    const typeArguments = typeNode.typeArguments

    if (!typeArguments || typeArguments.length === 0) {
      return typeName
    }

    // Try to resolve the type using the TypeScript type checker
    const type = this.checker.getTypeAtLocation(typeNode)
    const resolvedType = this.checker.typeToString(type)

    // If we can resolve it to a meaningful structure, use that
    if (
      resolvedType &&
      resolvedType !== typeName &&
      !resolvedType.includes('any')
    ) {
      // For type aliases like User<Role>, we want to create a synthetic type name
      // that represents the resolved structure
      const typeArgNames = typeArguments.map(arg => {
        if (ts.isTypeReferenceNode(arg) && ts.isIdentifier(arg.typeName)) {
          return arg.typeName.text
        }
        return this.getTypeNodeToString(arg)
      })

      return `${typeName}_${typeArgNames.join('_')}`
    }

    return typeName
  }

  /**
   * Checks if a type string represents a resolved generic type.
   *
   * @param type - The type string to check
   * @returns True if it's a resolved generic type
   * @private
   */
  private isResolvedGenericType(type: string): boolean {
    // Simple heuristic: resolved generic types contain underscores and
    // the parts after underscore should be known types
    const parts = type.split('_')
    return (
      parts.length > 1 &&
      parts
        .slice(1)
        .every(part => this.isKnownType(part) || this.isPrimitiveType(part))
    )
  }

  /**
   * Checks if a type is a known class or interface.
   *
   * @param typeName - The type name to check
   * @returns True if it's a known type
   * @private
   */
  private isKnownType(typeName: string): boolean {
    // First check if it's a primitive type to avoid unnecessary lookups
    if (this.isPrimitiveType(typeName)) {
      return true
    }

    try {
      // Use a more conservative approach - check if we can find the class
      // without actually transforming it to avoid side effects
      const found = this.findClassInProject(typeName)
      return found !== null
    } catch {
      return false
    }
  }

  /**
   * Finds a class by name in the project without transforming it.
   *
   * @param className - The class name to find
   * @returns True if found, false otherwise
   * @private
   */
  private findClassInProject(className: string): boolean {
    const sourceFiles = this.program.getSourceFiles().filter(sf => {
      if (sf.isDeclarationFile) return false
      if (sf.fileName.includes('.d.ts')) return false
      if (sf.fileName.includes('node_modules')) return false
      return true
    })

    for (const sourceFile of sourceFiles) {
      const found = this.findClassByName(sourceFile, className)
      if (found) return true
    }

    return false
  }

  /**
   * Checks if a type is a primitive type.
   *
   * @param typeName - The type name to check
   * @returns True if it's a primitive type
   * @private
   */
  private isPrimitiveType(typeName: string): boolean {
    const lowerTypeName = typeName.toLowerCase()

    // Check against all primitive types from constants
    const primitiveTypes = [
      constants.jsPrimitives.String.type.toLowerCase(),
      constants.jsPrimitives.Number.type.toLowerCase(),
      constants.jsPrimitives.Boolean.type.toLowerCase(),
      constants.jsPrimitives.Date.type.toLowerCase(),
      constants.jsPrimitives.Buffer.type.toLowerCase(),
      constants.jsPrimitives.Uint8Array.type.toLowerCase(),
      constants.jsPrimitives.File.type.toLowerCase(),
      constants.jsPrimitives.UploadFile.type.toLowerCase(),
      constants.jsPrimitives.BigInt.type.toLowerCase(),
    ]

    return primitiveTypes.includes(lowerTypeName)
  }

  /**
   * Resolves a generic type schema by analyzing the type alias structure.
   *
   * @param resolvedTypeName - The resolved generic type name (e.g., User_Role)
   * @returns OpenAPI schema for the resolved generic type
   * @private
   */
  private resolveGenericTypeSchema(
    resolvedTypeName: string
  ): SchemaType | null {
    const parts = resolvedTypeName.split('_')
    const baseTypeName = parts[0]
    const typeArgNames = parts.slice(1)

    if (!baseTypeName) {
      return null
    }

    // Find the original type alias declaration
    const typeAliasSymbol = this.findTypeAliasDeclaration(baseTypeName)
    if (!typeAliasSymbol) {
      return null
    }

    // Create a schema based on the type alias structure, substituting type parameters
    return this.createSchemaFromTypeAlias(typeAliasSymbol, typeArgNames)
  }

  /**
   * Finds a type alias declaration by name.
   *
   * @param typeName - The type alias name to find
   * @returns The type alias declaration node or null
   * @private
   */
  private findTypeAliasDeclaration(
    typeName: string
  ): ts.TypeAliasDeclaration | null {
    for (const sourceFile of this.program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile) continue

      const findTypeAlias = (node: ts.Node): ts.TypeAliasDeclaration | null => {
        if (ts.isTypeAliasDeclaration(node) && node.name.text === typeName) {
          return node
        }
        return ts.forEachChild(node, findTypeAlias) || null
      }

      const result = findTypeAlias(sourceFile)
      if (result) return result
    }
    return null
  }

  /**
   * Creates a schema from a type alias declaration, substituting type parameters.
   *
   * @param typeAlias - The type alias declaration
   * @param typeArgNames - The concrete type arguments
   * @returns OpenAPI schema for the type alias
   * @private
   */
  private createSchemaFromTypeAlias(
    typeAlias: ts.TypeAliasDeclaration,
    typeArgNames: string[]
  ): SchemaType | null {
    const typeNode = typeAlias.type

    if (ts.isTypeLiteralNode(typeNode)) {
      const schema: SchemaType = {
        type: 'object',
        properties: {},
        required: [],
      }

      for (const member of typeNode.members) {
        if (
          ts.isPropertySignature(member) &&
          member.name &&
          ts.isIdentifier(member.name)
        ) {
          const propertyName = member.name.text
          const isOptional = !!member.questionToken

          if (member.type) {
            const propertyType = this.resolveTypeParameterInTypeAlias(
              member.type,
              typeAlias.typeParameters,
              typeArgNames
            )

            const { type, format, nestedSchema } =
              this.mapTypeToSchema(propertyType)

            if (nestedSchema) {
              schema.properties[propertyName] = nestedSchema
            } else {
              schema.properties[propertyName] = { type }
              if (format) schema.properties[propertyName].format = format
            }

            if (!isOptional) {
              schema.required.push(propertyName)
            }
          }
        }
      }

      return schema
    }

    return null
  }

  /**
   * Resolves type parameters in a type alias to concrete types.
   *
   * @param typeNode - The type node to resolve
   * @param typeParameters - The type parameters of the type alias
   * @param typeArgNames - The concrete type arguments
   * @returns The resolved type string
   * @private
   */
  private resolveTypeParameterInTypeAlias(
    typeNode: ts.TypeNode,
    typeParameters: ts.NodeArray<ts.TypeParameterDeclaration> | undefined,
    typeArgNames: string[]
  ): string {
    if (
      ts.isTypeReferenceNode(typeNode) &&
      ts.isIdentifier(typeNode.typeName)
    ) {
      const typeName = typeNode.typeName.text

      // Check if this is a type parameter
      if (typeParameters) {
        const paramIndex = typeParameters.findIndex(
          param => param.name.text === typeName
        )
        if (paramIndex !== -1 && paramIndex < typeArgNames.length) {
          const resolvedType = typeArgNames[paramIndex]
          return resolvedType || typeName
        }
      }

      return typeName
    }

    return this.getTypeNodeToString(typeNode)
  }

  /**
   * Converts a TypeScript type node to its string representation.
   *
   * @param typeNode - The TypeScript type node to convert
   * @returns String representation of the type
   * @private
   */
  private getTypeNodeToString(typeNode: ts.TypeNode): string {
    if (
      ts.isTypeReferenceNode(typeNode) &&
      ts.isIdentifier(typeNode.typeName)
    ) {
      if (typeNode.typeName.text.toLowerCase().includes('uploadfile')) {
        return 'UploadFile'
      }

      if (typeNode.typeArguments && typeNode.typeArguments.length > 0) {
        const firstTypeArg = typeNode.typeArguments[0]
        if (
          firstTypeArg &&
          ts.isTypeReferenceNode(firstTypeArg) &&
          ts.isIdentifier(firstTypeArg.typeName)
        ) {
          if (firstTypeArg.typeName.text.toLowerCase().includes('uploadfile')) {
            return 'UploadFile'
          }
          if (typeNode.typeName.text === 'BaseDto') {
            return firstTypeArg.typeName.text
          }
        }

        return this.resolveGenericType(typeNode)
      }

      return typeNode.typeName.text
    }

    switch (typeNode.kind) {
      case ts.SyntaxKind.StringKeyword:
        return constants.jsPrimitives.String.type
      case ts.SyntaxKind.NumberKeyword:
        return constants.jsPrimitives.Number.type
      case ts.SyntaxKind.BooleanKeyword:
        return constants.jsPrimitives.Boolean.type
      case ts.SyntaxKind.ArrayType:
        const arrayType = typeNode as ts.ArrayTypeNode
        return `${this.getTypeNodeToString(arrayType.elementType)}[]`
      case ts.SyntaxKind.UnionType:
        // Handle union types like string | null
        const unionType = typeNode as ts.UnionTypeNode
        const types = unionType.types.map(t => this.getTypeNodeToString(t))
        // Filter out null and undefined, return the first meaningful type
        const meaningfulTypes = types.filter(
          t => t !== 'null' && t !== 'undefined'
        )
        if (meaningfulTypes.length > 0 && meaningfulTypes[0]) {
          return meaningfulTypes[0]
        }
        if (types.length > 0 && types[0]) {
          return types[0]
        }
        return 'object'
      default:
        const typeText = typeNode.getText()
        // Handle some common TypeScript utility types
        if (typeText.startsWith('Date')) return constants.jsPrimitives.Date.type
        if (typeText.includes('Buffer') || typeText.includes('Uint8Array'))
          return constants.jsPrimitives.Buffer.type
        return typeText
    }
  }

  /**
   * Extracts decorator information from a property declaration.
   *
   * @param member - The property declaration to analyze
   * @returns Array of decorator information including names and arguments
   * @private
   */
  private extractDecorators(member: ts.PropertyDeclaration): DecoratorInfo[] {
    const decorators: DecoratorInfo[] = []

    if (member.modifiers) {
      for (const modifier of member.modifiers) {
        if (
          ts.isDecorator(modifier) &&
          ts.isCallExpression(modifier.expression)
        ) {
          const decoratorName = this.getDecoratorName(modifier.expression)
          const args = this.getDecoratorArguments(modifier.expression)
          decorators.push({ name: decoratorName, arguments: args })
        } else if (
          ts.isDecorator(modifier) &&
          ts.isIdentifier(modifier.expression)
        ) {
          decorators.push({ name: modifier.expression.text, arguments: [] })
        }
      }
    }

    return decorators
  }

  /**
   * Gets the name of a decorator from a call expression.
   *
   * @param callExpression - The decorator call expression
   * @returns The decorator name or "unknown" if not identifiable
   * @private
   */
  private getDecoratorName(callExpression: ts.CallExpression): string {
    if (ts.isIdentifier(callExpression.expression)) {
      return callExpression.expression.text
    }
    return 'unknown'
  }

  /**
   * Extracts arguments from a decorator call expression.
   *
   * @param callExpression - The decorator call expression
   * @returns Array of parsed decorator arguments
   * @private
   */
  private getDecoratorArguments(callExpression: ts.CallExpression): any[] {
    return callExpression.arguments.map(arg => {
      if (ts.isNumericLiteral(arg)) return Number(arg.text)
      if (ts.isStringLiteral(arg)) return arg.text
      if (arg.kind === ts.SyntaxKind.TrueKeyword) return true
      if (arg.kind === ts.SyntaxKind.FalseKeyword) return false
      return arg.getText()
    })
  }

  /**
   * Generates an OpenAPI schema from extracted property information.
   *
   * @param properties - Array of property information to process
   * @param contextFile - Optional context file path for resolving class references
   * @returns Complete OpenAPI schema object with properties and validation rules
   * @private
   */
  private generateSchema(
    properties: PropertyInfo[],
    contextFile?: string
  ): SchemaType {
    const schema: SchemaType = {
      type: 'object',
      properties: {},
      required: [],
    }

    for (const property of properties) {
      const { type, format, nestedSchema } = this.mapTypeToSchema(
        property.type,
        contextFile
      )

      if (nestedSchema) {
        schema.properties[property.name] = nestedSchema
      } else {
        schema.properties[property.name] = { type }
        if (format) schema.properties[property.name].format = format
      }

      // Apply decorators if present
      this.applyDecorators(property.decorators, schema, property.name)

      // If no decorators are present, apply type-based format specifications
      if (property.decorators.length === 0) {
        this.applyTypeBasedFormats(property, schema)
      }

      // Determine if property should be required based on decorators and optional status
      this.determineRequiredStatus(property, schema)
    }

    return schema
  }

  /**
   * Maps TypeScript types to OpenAPI schema types and formats.
   * Handles primitive types, arrays, and nested objects recursively.
   *
   * @param type - The TypeScript type string to map
   * @param contextFile - Optional context file path for resolving class references
   * @returns Object containing OpenAPI type, optional format, and nested schema
   * @private
   */
  private mapTypeToSchema(
    type: string,
    contextFile?: string
  ): {
    type: string
    format?: string
    nestedSchema?: SchemaType
  } {
    // Handle arrays
    if (type.endsWith('[]')) {
      const elementType = type.slice(0, -2)
      const elementSchema = this.mapTypeToSchema(elementType, contextFile)
      const items: any = elementSchema.nestedSchema || {
        type: elementSchema.type,
      }
      if (elementSchema.format) items.format = elementSchema.format

      return {
        type: 'array',
        nestedSchema: {
          type: 'array',
          items,
          properties: {},
          required: [],
        },
      }
    }

    if (type.toLocaleLowerCase().includes('uploadfile')) type = 'UploadFile'

    // Handle primitives
    switch (type.toLowerCase()) {
      case constants.jsPrimitives.String.type.toLowerCase():
        return { type: constants.jsPrimitives.String.value }
      case constants.jsPrimitives.Number.type.toLowerCase():
        return { type: constants.jsPrimitives.Number.value }
      case constants.jsPrimitives.Boolean.type.toLowerCase():
        return { type: constants.jsPrimitives.Boolean.value }
      case constants.jsPrimitives.Date.type.toLowerCase():
        return {
          type: constants.jsPrimitives.Date.value,
          format: constants.jsPrimitives.Date.format,
        }
      case constants.jsPrimitives.Buffer.type.toLowerCase():
      case constants.jsPrimitives.Uint8Array.type.toLowerCase():
      case constants.jsPrimitives.File.type.toLowerCase():
        return {
          type: constants.jsPrimitives.Buffer.value,
          format: constants.jsPrimitives.Buffer.format,
        }
      case constants.jsPrimitives.UploadFile.type.toLowerCase():
        return {
          type: constants.jsPrimitives.UploadFile.value,
          format: constants.jsPrimitives.UploadFile.format,
        }
      default:
        // Check if it's a resolved generic type (e.g., User_Role)
        if (type.includes('_') && this.isResolvedGenericType(type)) {
          try {
            const genericSchema = this.resolveGenericTypeSchema(type)
            if (genericSchema) {
              return {
                type: constants.jsPrimitives.Object.value,
                nestedSchema: genericSchema,
              }
            }
          } catch (error) {
            console.warn(`Failed to resolve generic type ${type}:`, error)
          }
        }

        // Handle nested objects
        try {
          const nestedResult = this.transformByName(
            type,
            undefined,
            contextFile
          )
          return {
            type: constants.jsPrimitives.Object.value,
            nestedSchema: nestedResult.schema,
          }
        } catch {
          return { type: constants.jsPrimitives.Object.value }
        }
    }
  }

  /**
   * Applies class-validator decorators to schema properties.
   * Maps validation decorators to their corresponding OpenAPI schema constraints.
   *
   * @param decorators - Array of decorator information to apply
   * @param schema - The schema object to modify
   * @param propertyName - Name of the property being processed
   * @private
   */
  private applyDecorators(
    decorators: DecoratorInfo[],
    schema: SchemaType,
    propertyName: string
  ): void {
    const isArrayType =
      schema.properties[propertyName].type ===
      constants.jsPrimitives.Array.value

    for (const decorator of decorators) {
      const decoratorName = decorator.name

      switch (decoratorName) {
        case constants.validatorDecorators.IsString.name:
          if (!isArrayType) {
            schema.properties[propertyName].type =
              constants.validatorDecorators.IsString.type
          } else if (schema.properties[propertyName].items) {
            schema.properties[propertyName].items.type =
              constants.validatorDecorators.IsString.type
          }
          break
        case constants.validatorDecorators.IsInt.name:
          if (!isArrayType) {
            schema.properties[propertyName].type =
              constants.validatorDecorators.IsInt.type
            schema.properties[propertyName].format =
              constants.validatorDecorators.IsInt.format
          } else if (schema.properties[propertyName].items) {
            schema.properties[propertyName].items.type =
              constants.validatorDecorators.IsInt.type
            schema.properties[propertyName].items.format =
              constants.validatorDecorators.IsInt.format
          }
          break
        case constants.validatorDecorators.IsNumber.name:
          if (!isArrayType) {
            schema.properties[propertyName].type =
              constants.validatorDecorators.IsNumber.type
          } else if (schema.properties[propertyName].items) {
            schema.properties[propertyName].items.type =
              constants.validatorDecorators.IsNumber.type
          }
          break
        case constants.validatorDecorators.IsBoolean.name:
          if (!isArrayType) {
            schema.properties[propertyName].type =
              constants.validatorDecorators.IsBoolean.type
          } else if (schema.properties[propertyName].items) {
            schema.properties[propertyName].items.type =
              constants.validatorDecorators.IsBoolean.type
          }
          break
        case constants.validatorDecorators.IsEmail.name:
          if (!isArrayType) {
            schema.properties[propertyName].format =
              constants.validatorDecorators.IsEmail.format
          } else if (schema.properties[propertyName].items) {
            schema.properties[propertyName].items.format =
              constants.validatorDecorators.IsEmail.format
          }
          break
        case constants.validatorDecorators.IsDate.name:
          if (!isArrayType) {
            schema.properties[propertyName].type =
              constants.validatorDecorators.IsDate.type
            schema.properties[propertyName].format =
              constants.validatorDecorators.IsDate.format
          } else if (schema.properties[propertyName].items) {
            schema.properties[propertyName].items.type =
              constants.validatorDecorators.IsDate.type
            schema.properties[propertyName].items.format =
              constants.validatorDecorators.IsDate.format
          }
          break
        case constants.validatorDecorators.IsNotEmpty.name:
          if (!schema.required.includes(propertyName)) {
            schema.required.push(propertyName)
          }
          break
        case constants.validatorDecorators.MinLength.name:
          schema.properties[propertyName].minLength = decorator.arguments[0]
          break
        case constants.validatorDecorators.MaxLength.name:
          schema.properties[propertyName].maxLength = decorator.arguments[0]
          break
        case constants.validatorDecorators.Length.name:
          schema.properties[propertyName].minLength = decorator.arguments[0]
          if (decorator.arguments[1]) {
            schema.properties[propertyName].maxLength = decorator.arguments[1]
          }
          break
        case constants.validatorDecorators.Min.name:
          schema.properties[propertyName].minimum = decorator.arguments[0]
          break
        case constants.validatorDecorators.Max.name:
          schema.properties[propertyName].maximum = decorator.arguments[0]
          break
        case constants.validatorDecorators.IsPositive.name:
          schema.properties[propertyName].minimum = 0
          break
        case constants.validatorDecorators.IsArray.name:
          schema.properties[propertyName].type =
            constants.jsPrimitives.Array.value
          break
        case constants.validatorDecorators.ArrayNotEmpty.name:
          schema.properties[propertyName].minItems = 1
          if (!schema.required.includes(propertyName)) {
            schema.required.push(propertyName)
          }
          break
        case constants.validatorDecorators.ArrayMinSize.name:
          schema.properties[propertyName].minItems = decorator.arguments[0]
          break
        case constants.validatorDecorators.ArrayMaxSize.name:
          schema.properties[propertyName].maxItems = decorator.arguments[0]
          break
        case constants.validatorDecorators.IsEnum.name:
          this.applyEnumDecorator(decorator, schema, propertyName, isArrayType)
          break
      }
    }
  }

  /**
   * Applies the @IsEnum decorator to a property, handling both primitive values and object enums.
   * Supports arrays of enum values as well.
   *
   * @param decorator - The IsEnum decorator information
   * @param schema - The schema object to modify
   * @param propertyName - The name of the property
   * @param isArrayType - Whether the property is an array type
   * @private
   */
  private applyEnumDecorator(
    decorator: DecoratorInfo,
    schema: SchemaType,
    propertyName: string,
    isArrayType: boolean
  ): void {
    if (!decorator.arguments || decorator.arguments.length === 0) {
      return
    }

    const enumArg = decorator.arguments[0]
    let enumValues: any[] = []

    // Handle different enum argument types
    if (typeof enumArg === 'string') {
      // This is likely a reference to an enum type name
      // We need to try to resolve this to actual enum values
      enumValues = this.resolveEnumValues(enumArg)
    } else if (typeof enumArg === 'object' && enumArg !== null) {
      // Object enum - extract values
      if (Array.isArray(enumArg)) {
        // Already an array of values
        enumValues = enumArg
      } else {
        // Enum object - get all values
        enumValues = Object.values(enumArg)
      }
    }

    // If we couldn't resolve enum values, fall back to string type without enum constraint
    if (enumValues.length === 0) {
      if (!isArrayType) {
        schema.properties[propertyName].type = 'string'
      } else if (schema.properties[propertyName].items) {
        schema.properties[propertyName].items.type = 'string'
      }
      return
    }

    // Determine the type based on enum values
    let enumType = 'string'
    if (enumValues.length > 0) {
      const firstValue = enumValues[0]
      if (typeof firstValue === 'number') {
        enumType = 'number'
      } else if (typeof firstValue === 'boolean') {
        enumType = 'boolean'
      }
    }

    // Apply enum to schema
    if (!isArrayType) {
      schema.properties[propertyName].type = enumType
      schema.properties[propertyName].enum = enumValues
    } else if (schema.properties[propertyName].items) {
      schema.properties[propertyName].items.type = enumType
      schema.properties[propertyName].items.enum = enumValues
    }
  }

  /**
   * Attempts to resolve enum values from an enum type name.
   * This searches through the TypeScript AST to find the enum declaration
   * and extract its values.
   *
   * @param enumTypeName - The name of the enum type
   * @returns Array of enum values if found, empty array otherwise
   * @private
   */
  private resolveEnumValues(enumTypeName: string): any[] {
    // Search for enum declarations in source files
    for (const sourceFile of this.program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile) continue
      if (sourceFile.fileName.includes('node_modules')) continue

      const enumValues = this.findEnumValues(sourceFile, enumTypeName)
      if (enumValues.length > 0) {
        return enumValues
      }
    }

    return []
  }

  /**
   * Finds enum values in a specific source file.
   *
   * @param sourceFile - The source file to search
   * @param enumTypeName - The name of the enum to find
   * @returns Array of enum values if found, empty array otherwise
   * @private
   */
  private findEnumValues(
    sourceFile: ts.SourceFile,
    enumTypeName: string
  ): any[] {
    let enumValues: any[] = []

    const visit = (node: ts.Node) => {
      // Handle TypeScript enum declarations
      if (ts.isEnumDeclaration(node) && node.name?.text === enumTypeName) {
        enumValues = this.extractEnumValues(node)
        return
      }

      // Handle const object declarations (like const Status = { ... } as const)
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (
            ts.isVariableDeclaration(declaration) &&
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === enumTypeName &&
            declaration.initializer
          ) {
            let initializer = declaration.initializer

            // Handle "as const" assertions
            if (ts.isAsExpression(initializer) && initializer.expression) {
              initializer = initializer.expression
            }

            enumValues = this.extractObjectEnumValues(initializer)
            return
          }
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    return enumValues
  }

  /**
   * Extracts values from a TypeScript enum declaration.
   *
   * @param enumNode - The enum declaration node
   * @returns Array of enum values
   * @private
   */
  private extractEnumValues(enumNode: ts.EnumDeclaration): any[] {
    const values: any[] = []

    for (const member of enumNode.members) {
      if (member.initializer) {
        // Handle initialized enum members
        if (ts.isStringLiteral(member.initializer)) {
          values.push(member.initializer.text)
        } else if (ts.isNumericLiteral(member.initializer)) {
          values.push(Number(member.initializer.text))
        }
      } else {
        // Handle auto-incremented numeric enums
        if (values.length === 0) {
          values.push(0)
        } else {
          const lastValue = values[values.length - 1]
          if (typeof lastValue === 'number') {
            values.push(lastValue + 1)
          }
        }
      }
    }

    return values
  }

  /**
   * Extracts values from object literal enum (const object as const).
   *
   * @param initializer - The object literal initializer
   * @returns Array of enum values
   * @private
   */
  private extractObjectEnumValues(initializer: ts.Expression): any[] {
    const values: any[] = []

    if (ts.isObjectLiteralExpression(initializer)) {
      for (const property of initializer.properties) {
        if (ts.isPropertyAssignment(property) && property.initializer) {
          if (ts.isStringLiteral(property.initializer)) {
            values.push(property.initializer.text)
          } else if (ts.isNumericLiteral(property.initializer)) {
            values.push(Number(property.initializer.text))
          }
        }
      }
    }

    return values
  }

  /**
   * Applies sensible default behaviors for properties without class-validator decorators.
   * This allows the schema generator to work with plain TypeScript classes.
   *
   * @param property - The property information
   * @param schema - The schema object to modify
   * @private
   */
  /**
   * Applies OpenAPI format specifications based on TypeScript types.
   * This method is called when no decorators are present to set appropriate
   * format values for primitive types according to OpenAPI specification.
   *
   * @param property - The property information containing type details
   * @param schema - The schema object to modify
   * @private
   */
  private applyTypeBasedFormats(
    property: PropertyInfo,
    schema: SchemaType
  ): void {
    const propertyName = property.name
    const propertyType = property.type.toLowerCase()

    const propertySchema = schema.properties[propertyName]

    switch (propertyType) {
      case constants.jsPrimitives.Number.value:
        propertySchema.format = constants.jsPrimitives.Number.format
        break
      case constants.jsPrimitives.BigInt.value:
        propertySchema.format = constants.jsPrimitives.BigInt.format
        break
      case constants.jsPrimitives.Date.value:
        propertySchema.format = constants.jsPrimitives.Date.format
        break
      case constants.jsPrimitives.Buffer.value:
      case constants.jsPrimitives.Uint8Array.value:
      case constants.jsPrimitives.File.value:
      case constants.jsPrimitives.UploadFile.value:
        propertySchema.format = constants.jsPrimitives.UploadFile.format
        break
    }
  }

  /**
   * Determines if a property should be required based on decorators and optional status.
   *
   * Logic:
   * - If property has IsNotEmpty or ArrayNotEmpty decorator, it's required (handled in applyDecorators)
   * - Otherwise, the property is not required (preserving original behavior)
   * - The isOptional information is stored for future use and documentation
   *
   * @param property - The property information
   * @param schema - The schema object to modify
   * @private
   */
  private determineRequiredStatus(
    property: PropertyInfo,
    schema: SchemaType
  ): void {
    const propertyName = property.name

    // Check if already marked as required by IsNotEmpty or ArrayNotEmpty decorator
    const isAlreadyRequired = schema.required.includes(propertyName)

    // If already required by decorators, don't change it
    if (isAlreadyRequired) {
      return
    }

    // If property is optional (has ?), it should not be required unless explicitly marked
    if (property.isOptional) {
      return
    }

    // If property is not optional and not already required, make it required
    schema.required.push(propertyName)
  }
}

/**
 * Convenience function to transform a class using the singleton instance.
 *
 * @param cls - The class constructor function to transform
 * @param options - Optional configuration for memory management
 * @returns Object containing the class name and its corresponding JSON schema
 *
 * @example
 * ```typescript
 * import { transform } from 'class-validator-to-open-api'
 * import { User } from './entities/user.js'
 *
 * const schema = transform(User)
 * console.log(schema)
 * ```
 *
 * @example
 * ```typescript
 * // With memory optimization
 * const schema = transform(User, { maxCacheSize: 50, autoCleanup: true })
 * ```
 *
 * @public
 */
export function transform<T>(
  cls: new (...args: any[]) => T,
  options?: TransformerOptions
): {
  name: string
  schema: SchemaType
} {
  return SchemaTransformer.getInstance(undefined, options).transform(cls)
}

// Export types and interfaces for public use
export type { TransformerOptions }
export { SchemaTransformer }
