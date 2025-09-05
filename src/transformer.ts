import ts from 'typescript'

import { constants } from './transformer.fixtures.js'
import {
  type SchemaType,
  type DecoratorInfo,
  type PropertyInfo,
  type TransformerOptions,
  Property,
} from './types.js'

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
  private static instance: SchemaTransformer | null | undefined = null
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
   * Set of class names currently being processed to prevent circular references
   * Key format: "fileName:className" for uniqueness across different files
   * @private
   */
  private processingClasses = new Set<string>()

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
   * Transforms a class by its name into an OpenAPI schema object.
   * Considers the context of the calling file to resolve ambiguous class names.
   * Includes circular reference detection to prevent infinite recursion.
   *
   * @param className - The name of the class to transform
   * @param contextFilePath - Optional path to context file for resolving class ambiguity
   * @returns Object containing the class name and its corresponding JSON schema
   * @throws {Error} When the specified class cannot be found
   * @private
   */
  private transformByName(
    className: string,
    contextFilePath?: string
  ): { name: string; schema: SchemaType } {
    // Get all relevant source files (not declaration files and not in node_modules)
    const sourceFiles = this.program.getSourceFiles().filter(sf => {
      if (sf.isDeclarationFile) return false
      if (sf.fileName.includes('.d.ts')) return false
      if (sf.fileName.includes('node_modules')) return false

      // Mark file as loaded for memory tracking
      this.loadedFiles.add(sf.fileName)

      return true
    })

    // If we have a context file, try to find the class in that file first
    if (contextFilePath) {
      const contextSourceFile = this.program.getSourceFile(contextFilePath)
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

          // Check for circular reference before processing
          if (this.processingClasses.has(cacheKey)) {
            // Return a $ref reference to break circular dependency (OpenAPI 3.1 style)
            return {
              name: className,
              schema: {
                $ref: `#/components/schemas/${className}`,
                description: `Reference to ${className} (circular reference detected)`,
              },
            }
          }

          // Mark this class as being processed
          this.processingClasses.add(cacheKey)

          try {
            const result = this.transformClass(classNode, contextSourceFile)
            this.classCache.set(cacheKey, result)
            this.cleanupCache()
            return result
          } finally {
            // Always remove from processing set when done
            this.processingClasses.delete(cacheKey)
          }
        }
      }
    }

    // Fallback to searching all files, but prioritize files that are more likely to be relevant
    const prioritizedFiles = this.prioritizeSourceFiles(
      sourceFiles,
      contextFilePath
    )

    for (const sourceFile of prioritizedFiles) {
      const classNode = this.findClassByName(sourceFile, className)
      if (classNode && sourceFile?.fileName) {
        const cacheKey = this.getCacheKey(sourceFile.fileName, className)

        // Check cache first using fileName:className as key
        if (this.classCache.has(cacheKey)) {
          return this.classCache.get(cacheKey)!
        }

        // Check for circular reference before processing
        if (this.processingClasses.has(cacheKey)) {
          // Return a $ref reference to break circular dependency (OpenAPI 3.1 style)
          return {
            name: className,
            schema: {
              $ref: `#/components/schemas/${className}`,
              description: `Reference to ${className} (circular reference detected)`,
            },
          }
        }

        // Mark this class as being processed
        this.processingClasses.add(cacheKey)

        try {
          const result = this.transformClass(classNode, sourceFile)

          // Cache using fileName:className as key for uniqueness
          this.classCache.set(cacheKey, result)

          // Clean up cache if it gets too large
          this.cleanupCache()

          return result
        } finally {
          // Always remove from processing set when done
          this.processingClasses.delete(cacheKey)
        }
      }
    }

    throw new Error(`Class ${className} not found`)
  }

  /**
   * Prioritizes source files based on context to resolve class name conflicts.
   * Gives priority to files in the same directory or with similar names.
   *
   * @param sourceFiles - Array of source files to prioritize
   * @param contextFilePath - Optional path to context file for prioritization
   * @returns Prioritized array of source files
   * @private
   */
  private prioritizeSourceFiles(
    sourceFiles: ts.SourceFile[],
    contextFilePath?: string
  ): ts.SourceFile[] {
    if (!contextFilePath) {
      return sourceFiles
    }

    const contextDir = contextFilePath.substring(
      0,
      contextFilePath.lastIndexOf('/')
    )

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
   * @private
   */
  private static clearInstance(): void {
    SchemaTransformer.instance = undefined
  }

  /**
   * Flag to prevent recursive disposal calls
   * @private
   */
  private static disposingInProgress = false

  /**
   * Completely disposes of the current singleton instance and releases all resources.
   * This is a static method that can be called without having an instance reference.
   * Ensures complete memory cleanup regardless of the current state.
   *
   * @example
   * ```typescript
   * SchemaTransformer.disposeInstance();
   * // All resources released, next getInstance() will create fresh instance
   * ```
   *
   * @public
   */
  public static disposeInstance(): void {
    // Prevent recursive disposal calls
    if (SchemaTransformer.disposingInProgress) {
      return
    }

    SchemaTransformer.disposingInProgress = true

    try {
      if (SchemaTransformer.instance) {
        SchemaTransformer.instance.dispose()
      }
    } catch (error) {
      // Log any disposal errors but continue with cleanup
      console.warn('Warning during static disposal:', error)
    } finally {
      // Always ensure the static instance is cleared
      SchemaTransformer.instance = undefined
      SchemaTransformer.disposingInProgress = false

      // Force garbage collection for cleanup
      if (global.gc) {
        global.gc()
      }
    }
  }

  public static getInstance(
    tsConfigPath?: string,
    options?: TransformerOptions
  ): SchemaTransformer {
    if (!SchemaTransformer.instance || SchemaTransformer.isInstanceDisposed()) {
      SchemaTransformer.instance = new SchemaTransformer(tsConfigPath, options)
    }
    return SchemaTransformer.instance
  }

  /**
   * Internal method to check if current instance is disposed
   * @private
   */
  private static isInstanceDisposed(): boolean {
    return SchemaTransformer.instance
      ? SchemaTransformer.instance.isDisposed()
      : true
  }

  /**
   * Transforms a class using the singleton instance
   * @param cls - The class constructor function to transform
   * @param options - Optional configuration for memory management (only used if no instance exists)
   * @returns Object containing the class name and its corresponding JSON schema
   * @public
   */
  public static transformClass<T>(
    cls: new (...args: any[]) => T,
    options?: TransformerOptions
  ): {
    name: string
    schema: SchemaType
  } {
    // Use the singleton instance instead of creating a temporary one
    const transformer = SchemaTransformer.getInstance(undefined, options)
    return transformer.transform(cls)
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
    this.processingClasses.clear()

    // Force garbage collection hint if available
    if (global.gc) {
      global.gc()
    }
  }

  /**
   * Completely disposes of the transformer instance and releases all resources.
   * This includes clearing all caches, releasing TypeScript program resources,
   * and resetting the singleton instance.
   *
   * After calling this method, you need to call getInstance() again to get a new instance.
   *
   * @example
   * ```typescript
   * const transformer = SchemaTransformer.getInstance();
   * // ... use transformer
   * transformer.dispose();
   * // transformer is now unusable, need to get new instance
   * const newTransformer = SchemaTransformer.getInstance();
   * ```
   *
   * @private
   */
  private dispose(): void {
    try {
      // Clear all caches and sets completely
      this.classCache.clear()
      this.loadedFiles.clear()
      this.processingClasses.clear()

      // Release TypeScript program resources
      // While TypeScript doesn't provide explicit disposal methods,
      // we can help garbage collection by clearing all references

      // Clear all references to TypeScript objects
      // @ts-ignore - We're intentionally setting these to null for cleanup
      this.program = null
      // @ts-ignore - We're intentionally setting these to null for cleanup
      this.checker = null
    } catch (error) {
      // If there's any error during disposal, log it but continue
      console.warn('Warning during transformer disposal:', error)
    } finally {
      // Force garbage collection for cleanup
      if (global.gc) {
        global.gc()
      }
    }
  }

  /**
   * Checks if the transformer instance has been disposed and is no longer usable.
   *
   * @returns True if the instance has been disposed
   *
   * @example
   * ```typescript
   * const transformer = SchemaTransformer.getInstance();
   * transformer.dispose();
   * console.log(transformer.isDisposed()); // true
   * ```
   *
   * @private
   */
  private isDisposed(): boolean {
    return (
      !this.program ||
      !this.checker ||
      !this.classCache ||
      !this.loadedFiles ||
      !this.processingClasses
    )
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
    const properties = this.getPropertiesByClass(classNode)
    const schema = this.generateSchema({
      properties,
      typeName: 'object',
      contextFilePath: sourceFile?.fileName as string,
    })

    return { name: className, schema }
  }

  /**
   * Extracts property information from a class declaration.
   *
   * @param classNode - The TypeScript class declaration node
   * @returns Array of property information including names, types, decorators, and optional status
   * @private
   */
  private getPropertiesByClass(classNode: ts.ClassDeclaration): PropertyInfo[] {
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
        const isGeneric = this.isPropertyTypeGeneric(member)
        const isPrimitive = this.isPrimitiveType(type)

        properties.push({
          name: propertyName,
          type,
          decorators,
          isOptional,
          isGeneric,
          originalProperty: member,
          isPrimitive,
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
    return this.getStringFromType(type)
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
    const resolvedType = this.getStringFromType(type)

    // If we can resolve it to a meaningful structure, use that
    if (
      resolvedType &&
      resolvedType !== typeName &&
      !resolvedType.includes('any')
    ) {
      return resolvedType
    }

    return typeName
  }

  /**
   * Checks if a type string represents a resolved generic type.
   * This is a legacy method that checks string patterns.
   *
   * @param type - The type string to check
   * @returns True if it's a resolved generic type
   * @private
   * @deprecated Use isGenericTypeFromNode or isGenericTypeFromSymbol instead
   */
  private isGenericType(type: string): boolean {
    if (type.startsWith(constants.tsUtilityTypes.Partial.value)) return true
    if (type.startsWith(constants.tsUtilityTypes.Required.value)) return true

    return false
  }

  /**
   * Checks if a TypeScript type node represents a generic type using TypeScript's API.
   * This is a more robust approach than string-based detection.
   *
   * @param typeNode - The TypeScript type node to analyze
   * @returns True if it's a generic type
   * @private
   */
  private isGenericTypeFromNode(typeNode: ts.TypeNode): boolean {
    // Check if it's a type reference with type arguments (e.g., Array<T>, Promise<T>)
    if (ts.isTypeReferenceNode(typeNode) && typeNode.typeArguments) {
      return typeNode.typeArguments.length > 0
    }

    // Check for mapped types (e.g., { [K in keyof T]: T[K] })
    if (ts.isMappedTypeNode(typeNode)) {
      return true
    }

    // Check for conditional types (e.g., T extends U ? X : Y)
    if (ts.isConditionalTypeNode(typeNode)) {
      return true
    }

    // Check for indexed access types (e.g., T[K])
    if (ts.isIndexedAccessTypeNode(typeNode)) {
      return true
    }

    // Check for type operators like keyof, typeof
    if (ts.isTypeOperatorNode(typeNode)) {
      return true
    }

    return false
  }

  /**
   * Checks if a TypeScript Type represents a simple array type (not a generic utility type).
   * Simple arrays like string[], Data[], User[] should not be considered generic types.
   *
   * @param type - The TypeScript Type to check
   * @returns True if it's a simple array type
   * @private
   */
  private isSimpleArrayType(type: ts.Type): boolean {
    const symbol = type.getSymbol()
    if (!symbol || symbol.getName() !== 'Array') {
      return false
    }

    // Check if this is Array<T> where T is a simple, non-generic type
    if (
      (type as any).typeArguments &&
      (type as any).typeArguments.length === 1
    ) {
      const elementType = (type as any).typeArguments[0]
      if (!elementType) return false

      // If the element type is a utility type, then this array should be considered generic
      if (this.isUtilityTypeFromType(elementType)) {
        return false
      }

      // If the element type itself has generic parameters, this array is generic
      if (
        (elementType as any).typeArguments &&
        (elementType as any).typeArguments.length > 0
      ) {
        return false
      }

      return true
    }

    return false
  }

  /**
   * Checks if a TypeScript Type represents a utility type.
   *
   * @param type - The TypeScript Type to check
   * @returns True if it's a utility type
   * @private
   */
  private isUtilityTypeFromType(type: ts.Type): boolean {
    if (!type.aliasSymbol) return false

    const aliasName = type.aliasSymbol.getName()
    const utilityTypes = [
      'Partial',
      'Required',
      'Readonly',
      'Pick',
      'Omit',
      'Record',
      'Exclude',
      'Extract',
      'NonNullable',
    ]

    return utilityTypes.includes(aliasName)
  }

  /**
   * Checks if a TypeScript type (from TypeChecker) represents a generic type.
   * Uses the TypeChecker API to analyze type symbols and flags.
   *
   * @param type - The TypeScript type from TypeChecker
   * @returns True if it's a generic type
   * @private
   */
  private isGenericTypeFromSymbol(type: ts.Type): boolean {
    // First check if it's a simple array type - these should NOT be considered generic
    if (this.isSimpleArrayType(type)) {
      return false
    }

    // Check if the type has type parameters
    if (type.aliasTypeArguments && type.aliasTypeArguments.length > 0) {
      return true
    }

    // Check if it's a type reference with type arguments
    // But exclude simple arrays which internally use Array<T> representation
    if ((type as any).typeArguments && (type as any).typeArguments.length > 0) {
      const symbol = type.getSymbol()
      if (symbol && symbol.getName() === 'Array') {
        // This is Array<T> - only consider it generic if T itself is a utility type
        const elementType = (type as any).typeArguments[0]
        if (elementType) {
          return this.isUtilityTypeFromType(elementType)
        }
        return false
      }

      const elementType = (type as any).typeArguments[0]

      return this.isUtilityTypeFromType(elementType)
    }

    // Check type flags for generic indicators
    if (type.flags & ts.TypeFlags.TypeParameter) {
      return true
    }

    if (type.flags & ts.TypeFlags.Conditional) {
      return true
    }

    if (type.flags & ts.TypeFlags.Index) {
      return true
    }

    if (type.flags & ts.TypeFlags.IndexedAccess) {
      return true
    }

    // Check if the type symbol indicates a generic type
    const symbol = type.getSymbol()
    if (symbol && symbol.declarations) {
      for (const declaration of symbol.declarations) {
        // Check for type alias declarations with type parameters
        if (
          ts.isTypeAliasDeclaration(declaration) &&
          declaration.typeParameters
        ) {
          return true
        }

        // Check for interface declarations with type parameters
        if (
          ts.isInterfaceDeclaration(declaration) &&
          declaration.typeParameters
        ) {
          return true
        }

        // Check for class declarations with type parameters
        if (ts.isClassDeclaration(declaration) && declaration.typeParameters) {
          return true
        }
      }
    }

    return false
  }

  /**
   * Enhanced method to check if a property type is generic.
   * Uses both the property declaration and TypeChecker for comprehensive analysis.
   *
   * @param property - The property declaration to analyze
   * @returns True if the property type is generic
   * @private
   */
  private isPropertyTypeGeneric(property: ts.PropertyDeclaration): boolean {
    // First, check the type node if it exists
    if (property.type && this.isGenericTypeFromNode(property.type)) {
      return true
    }

    // Then check using TypeChecker
    try {
      const type = this.checker.getTypeAtLocation(property)
      return this.isGenericTypeFromSymbol(type)
    } catch (error) {
      console.warn('Error analyzing property type for generics:', error)
      return false
    }
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
      constants.jsPrimitives.Symbol.type.toLowerCase(),
      constants.jsPrimitives.null.type.toLowerCase(),
      constants.jsPrimitives.Object.type.toLowerCase(),
      constants.jsPrimitives.Array.type.toLowerCase(),
    ]

    const primitivesArray = primitiveTypes.map(t => t.concat('[]'))

    return (
      primitiveTypes.includes(lowerTypeName) ||
      primitivesArray.includes(lowerTypeName)
    )
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
    const parts = resolvedTypeName.split('<')
    let baseTypeName = parts[1]?.trim()

    if (!baseTypeName) {
      return null
    }

    baseTypeName = baseTypeName.substring(0, baseTypeName.length - 1)

    let { schema } = this.transformByName(baseTypeName)

    if (parts[0]?.includes(constants.tsUtilityTypes.Partial.value))
      schema.required = []
    else {
      schema.required = Object.entries(schema.properties).map(
        ([key, value]) => key
      )
    }

    return schema
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
   * @param contextFilePath - Optional context file path for resolving class references
   * @returns Complete OpenAPI schema object with properties and validation rules
   * @private
   */
  private generateSchema({
    properties,
    contextFilePath,
    typeName,
    classesGenerated = new Set<any>(),
  }: {
    properties: PropertyInfo[]
    contextFilePath?: string
    typeName?: string
    classesGenerated?: Set<any>
  }): SchemaType {
    const schema: SchemaType = {
      type: 'object',
      properties: {},
      required: [],
    }

    for (const property of properties) {
      const typeSymbol = this.checker.getTypeAtLocation(
        property.originalProperty
      )

      schema.properties[property.name] = {}

      if (property.isPrimitive) {
        schema.properties[property.name] =
          this.getSchemaForPrimitiveType(property)
      }
      // Utility Types (Partial, and Required only supported)
      else if (this.isUtilityType(typeSymbol, property.type)) {
        schema.properties[property.name] =
          this.getSchemaForUtilityType(typeSymbol)
      }
      // Generic Types
      else if (property.isGeneric) {
        const { type, format, nestedSchema } = this.mapGenericTypeToSchema(
          property,
          contextFilePath
        )

        if (nestedSchema) {
          schema.properties[property.name] = nestedSchema
          // Skip decorator application for $ref schemas
          if (this.isRefSchema(nestedSchema)) {
            continue
          }
        } else {
          schema.properties[property.name] = { type, properties: {} }
          if (format) schema.properties[property.name].format = format
        }
      }
      // Handle external types
      else if (this.isExternalType(typeSymbol, property.type)) {
        schema.properties[property.name] =
          this.getSchemaFromExternalType(typeSymbol, property.type) || {}
      }
      // Handle any/unknown types
      else if (this.isAnyType(property.type)) {
        if (this.isArrayType(property.type)) {
          schema.properties[property.name] = {
            type: 'array',
            items: {},
          }
        }
      }
      // Handle internal types
      else {
        const parseClass = this.getClassNodeFromType(
          typeSymbol,
          new Set<ts.Type>(),
          property.type
        )

        if (parseClass) {
          if (classesGenerated.has(parseClass)) {
            // To prevent infinite recursion in circular references, use a $ref
            schema.properties[property.name] = {
              $ref: `#/components/schemas/${parseClass.name?.text}`,
              description: `Reference to ${property.type} (circular reference detected)`,
            }

            continue
          }

          classesGenerated.add(parseClass)

          schema.properties[property.name] = this.getSchemaFromClass({
            parseClass,
            typeName: property.type,
            classesGenerated,
          })
        }
      }

      this.determineRequiredStatus(property, schema)

      this.applyDecorators(property.decorators, schema, property.name)
    }

    if (typeName?.endsWith('[]') || typeName?.startsWith('Array<')) {
      schema.type = 'array'
      schema.items = {
        type: 'object',
        properties: schema.properties,
        required: schema.required,
      }

      //@ts-ignore
      delete schema.properties
      //@ts-ignore
      delete schema.required
    }

    if (schema.properties && Object.keys(schema.properties).length === 0) {
      schema.type = 'object'
      schema.additionalProperties = true
    }

    classesGenerated.clear()

    return schema
  }

  private isAnyType(type: string) {
    return (
      type === 'any' ||
      type === 'unknown' ||
      type.endsWith('any[]') ||
      type.endsWith('unknown[]')
    )
  }

  /**
   *
   * @param parseClass
   * @returns
   */
  getSchemaFromClass({
    parseClass,
    typeName,
    classesGenerated = new Set<any>(),
  }: {
    parseClass: ts.ClassDeclaration
    typeName?: string
    classesGenerated?: Set<any>
  }) {
    const properties = this.getPropertiesByClass(parseClass)
    return this.generateSchema({
      properties,
      typeName: typeName as string,
      classesGenerated,
    })
  }

  /**
   * Checks if a TypeScript Node is of an external type.
   *
   * @param node - The TypeScript node to check
   * @returns True if the node is of an external type
   * @private
   */
  private isExternalType(type: ts.Type, typeName: string): boolean {
    // For arrays, check if the element type is external, not the array itself
    if (this.isArrayType(typeName)) {
      const elementType = this.getArrayElementType(type)
      if (elementType) {
        return this.isExternalTypeFromType(elementType)
      }
      return false
    }

    return this.isExternalTypeFromType(type)
  }

  /**
   * Checks if a TypeScript Type comes from an external library (node_modules).
   *
   * @param type - The TypeScript type to check
   * @returns True if the type is from an external library
   * @private
   */
  private isExternalTypeFromType(type: ts.Type): boolean {
    const symbol = type.getSymbol()
    if (!symbol) return false

    const declaration = symbol.valueDeclaration || symbol.declarations?.[0]
    if (!declaration) return false

    const sourceFile = declaration.getSourceFile().fileName

    return sourceFile.includes('node_modules')
  }
  /**
   * Extracts properties from an external type using TypeChecker API.
   * This method can analyze types from external packages and create detailed schemas.
   *
   * @param property - The property declaration with the external type
   * @param contextFilePath - Optional context file path for module resolution
   * @returns Detailed schema for the external type or null if cannot be resolved
   * @private
   */
  private getSchemaFromExternalType(
    type: ts.Type,
    typeName: string
  ): SchemaType | null {
    try {
      // Get the symbol for the type
      const symbol = type.getSymbol()
      if (!symbol) {
        return null
      }

      const properties: PropertyInfo[] = []
      const typeProperties = this.checker.getPropertiesOfType(type)

      for (const prop of typeProperties) {
        const propName = prop.getName()

        // Skip private properties and methods
        if (propName.startsWith('_') || propName.startsWith('#')) {
          continue
        }

        const propDeclaration = prop.valueDeclaration

        if (propDeclaration && ts.isPropertyDeclaration(propDeclaration)) {
          const propertyName = prop.name
          const type = this.getPropertyType(propDeclaration)
          const decorators = this.extractDecorators(propDeclaration)
          const isOptional = !!propDeclaration.questionToken
          const isGeneric = this.isPropertyTypeGeneric(propDeclaration)
          const isPrimitive = this.isPrimitiveType(type)

          properties.push({
            name: propertyName,
            type,
            decorators,
            isOptional,
            isGeneric,
            originalProperty: propDeclaration,
            isPrimitive,
          })
        }
      }

      return this.generateSchema({ properties, typeName })
    } catch (error) {
      console.warn('Failed to extract properties from external type:', error)
      return null
    }
  }

  /**
   * Maps TypeScript types to OpenAPI schema types and formats.
   * Handles primitive types, arrays, and nested objects recursively.
   *
   * @param type - The TypeScript type string to map
   * @param contextFilePath - Optional context file path for resolving class references
   * @returns Object containing OpenAPI type, optional format, and nested schema
   * @private
   */
  private mapTypeToSchema(
    type: string,
    contextFilePath?: string
  ): {
    type: string
    format?: string
    nestedSchema?: SchemaType
  } {
    // Handle arrays
    if (type.endsWith('[]')) {
      const elementType = type.slice(0, -2)
      const elementSchema = this.mapTypeToSchema(elementType, contextFilePath)
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
        if (this.isGenericType(type)) {
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
          const nestedResult = this.transformByName(type, contextFilePath)

          // Check if it's a $ref schema (circular reference)
          if (nestedResult.schema.$ref) {
            return {
              type: constants.jsPrimitives.Object.value,
              nestedSchema: nestedResult.schema,
            }
          }

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
   * Maps generic TypeScript types to OpenAPI schema types using TypeScript's API.
   * This method provides enhanced handling for generic types compared to the basic mapTypeToSchema.
   *
   * @param property - The property information containing the generic type
   * @param contextFilePath - Optional context file path for resolving class references
   * @returns Object containing OpenAPI type, optional format, and nested schema
   * @private
   */
  private mapGenericTypeToSchema(
    property: PropertyInfo,
    contextFilePath?: string
  ): {
    type: string
    format?: string
    nestedSchema?: SchemaType
  } {
    if (!property.originalProperty) {
      // Fallback to regular mapping if no original property is available
      return this.mapTypeToSchema(property.type, contextFilePath)
    }

    try {
      const type = this.checker.getTypeAtLocation(property.originalProperty)

      // Handle arrays with generic element types
      if (this.isArrayType(property.type)) {
        const elementType = this.getArrayElementType(type)
        if (elementType) {
          const elementSchema = this.mapTypeFromTSType(
            elementType,
            contextFilePath
          )
          return {
            type: 'array',
            nestedSchema: {
              type: 'array',
              items: elementSchema.nestedSchema || { type: elementSchema.type },
              properties: {},
              required: [],
            },
          }
        }
      }

      // Handle generic utility types (Partial<T>, Required<T>, etc.)
      if (this.isUtilityType(type, property.type)) {
        const schema = this.getSchemaForUtilityType(type)
        return { type: 'object', nestedSchema: schema }
      }

      // Handle other generic types
      const mappedType = this.mapTypeFromTSType(type, contextFilePath)
      return mappedType
    } catch (error) {
      console.warn(
        `Error mapping generic type for property ${property.name}:`,
        error
      )
      // Fallback to regular mapping
      return this.mapTypeToSchema(property.type, contextFilePath)
    }
  }

  /**
   * Maps a TypeScript Type object to OpenAPI schema.
   *
   * @param type - The TypeScript Type object from TypeChecker
   * @param contextFilePath - Optional context file path for resolving class references
   * @returns Object containing OpenAPI type, optional format, and nested schema
   * @private
   */
  private mapTypeFromTSType(
    type: ts.Type,
    contextFilePath?: string
  ): {
    type: string
    format?: string
    nestedSchema?: SchemaType
  } {
    const typeString = this.getStringFromType(type)

    // Check for primitive types first
    if (type.flags & ts.TypeFlags.String) {
      return { type: 'string' }
    }
    if (type.flags & ts.TypeFlags.Number) {
      return { type: 'number' }
    }
    if (type.flags & ts.TypeFlags.Boolean) {
      return { type: 'boolean' }
    }

    // Handle Date objects
    if (typeString === 'Date') {
      return {
        type: 'string',
        format: 'date-time',
      }
    }

    // Handle object types
    if (type.flags & ts.TypeFlags.Object) {
      // Try to resolve as a class type
      try {
        const nestedResult = this.transformByName(typeString, contextFilePath)
        return {
          type: 'object',
          nestedSchema: nestedResult.schema,
        }
      } catch {
        return { type: 'object' }
      }
    }

    // Default fallback
    return { type: 'object' }
  }

  private getStringFromType(type: ts.Type) {
    return this.checker.typeToString(type)
  }

  /**
   * Checks if a TypeScript Type represents an array type.
   *
   * @param type - The TypeScript Type to check
   * @returns True if it's an array type
   * @private
   */
  private isArrayType(typeName: string): boolean {
    return typeName.endsWith('[]') || typeName.startsWith('Array<')
  }

  /**
   * Gets the element type of an array type.
   *
   * @param type - The array TypeScript Type
   * @returns The element type or undefined if not an array
   * @private
   */
  private getArrayElementType(type: ts.Type): ts.Type | undefined {
    // For Array<T>, the type arguments contain the element type
    if ((type as any).typeArguments && (type as any).typeArguments.length > 0) {
      return (type as any).typeArguments[0]
    }

    // For T[], get the number index type
    return type.getNumberIndexType()
  }

  /**
   * Checks if a TypeScript Type is a utility type (Partial, Required, etc.).
   *
   * @param type - The TypeScript Type to check
   * @returns True if it's a utility type
   * @private
   */
  private isUtilityType(type: ts.Type, typeName: string): boolean {
    if (!type.aliasSymbol) return false

    return (
      typeName.startsWith(constants.tsUtilityTypes.Partial.value) ||
      typeName.startsWith(constants.tsUtilityTypes.Required.value)
    )
  }

  /**
   * Handles utility types like Partial<T>, Required<T>, etc.
   *
   * @param type - The utility type to handle
   * @param contextFilePath - Optional context file path for resolving class references
   * @returns Object containing OpenAPI type, optional format, and nested schema
   * @private
   */
  private getSchemaForUtilityType(type: ts.Type): SchemaType {
    if (
      !type.aliasSymbol ||
      !type.aliasTypeArguments ||
      type.aliasTypeArguments.length === 0
    ) {
      return { type: 'object', properties: {}, required: [] }
    }

    const aliasName = type.aliasSymbol.getName()
    const baseType = type.aliasTypeArguments[0]

    if (!baseType || !baseType.isClass()) {
      return { type: 'object', properties: {}, required: [] }
    }

    try {
      const properties: PropertyInfo[] = []
      baseType.getProperties().forEach(property => {
        const declaration = property?.valueDeclaration as ts.PropertyDeclaration

        if (declaration && ts.isPropertyDeclaration(declaration as ts.Node)) {
          const propertyName = declaration.name.getText()
          const type = this.getPropertyType(declaration)
          const decorators = this.extractDecorators(declaration)
          const isOptional = !!declaration.questionToken
          const isGeneric = this.isPropertyTypeGeneric(declaration)
          const isPrimitive = this.isPrimitiveType(type)

          properties.push({
            name: propertyName,
            type,
            decorators,
            isOptional,
            isGeneric,
            originalProperty: declaration,
            isPrimitive,
          })
        }
      })

      let schema = this.generateSchema({ properties })

      if (aliasName === constants.tsUtilityTypes.Partial.type) {
        schema.required = []
      } else {
        schema.required = Object.keys(schema.properties)
      }

      return schema
    } catch (error) {
      console.warn(`Error handling utility type ${aliasName}:`, error)
      return { type: 'object', properties: {}, required: [] }
    }
  }

  /**
   * Checks if a schema is a $ref schema (circular reference).
   *
   * @param schema - The schema to check
   * @returns True if it's a $ref schema
   * @private
   */
  private isRefSchema(schema: SchemaType): schema is { $ref: string } {
    return '$ref' in schema
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
    // Skip applying decorators to $ref schemas
    if (this.isRefSchema(schema)) {
      return
    }

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
  private getSchemaForPrimitiveType(property: PropertyInfo): Property | void {
    const propertySchema = {} as Property
    const isArray = this.isArrayType(property.type)
    const propertyType = property.type.toLowerCase().replace('[]', '').trim()

    switch (propertyType) {
      case constants.jsPrimitives.String.value:
        propertySchema.type = constants.jsPrimitives.String.value
        break
      case constants.jsPrimitives.Number.value:
        propertySchema.type = constants.jsPrimitives.Number.value
        propertySchema.format = constants.jsPrimitives.Number.format
        break
      case constants.jsPrimitives.BigInt.type.toLocaleLowerCase():
        propertySchema.type = constants.jsPrimitives.BigInt.value
        propertySchema.format = constants.jsPrimitives.BigInt.format
        break
      case constants.jsPrimitives.Date.value:
        propertySchema.type = constants.jsPrimitives.Date.value
        propertySchema.format = constants.jsPrimitives.Date.format
        break
      case constants.jsPrimitives.Buffer.value:
      case constants.jsPrimitives.Uint8Array.value:
      case constants.jsPrimitives.File.value:
      case constants.jsPrimitives.UploadFile.value:
        propertySchema.type = constants.jsPrimitives.UploadFile.value
        propertySchema.format = constants.jsPrimitives.UploadFile.format
        break
      case constants.jsPrimitives.Array.value:
        propertySchema.type = constants.jsPrimitives.Array.value
        break
      case constants.jsPrimitives.Boolean.value:
        propertySchema.type = constants.jsPrimitives.Boolean.value
        break
      case constants.jsPrimitives.Symbol.type.toLocaleLowerCase():
        propertySchema.type = constants.jsPrimitives.Symbol.value
        break
      case constants.jsPrimitives.Object.value:
        propertySchema.type = constants.jsPrimitives.Object.value
        break
      default:
        propertySchema.type = constants.jsPrimitives.String.value
    }

    if (isArray) {
      propertySchema.type = `array`
      propertySchema.items = { type: propertyType }
    }

    return propertySchema
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
    // Skip determining required status for $ref schemas
    if (this.isRefSchema(schema)) {
      return
    }

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

  /**
   * Gets the class declaration node from a TypeScript Type.
   * Handles both direct class types and array element types.
   *
   * @param type - The TypeScript Type to analyze
   * @param visitedTypes - Set to track visited types and prevent infinite recursion
   * @returns The class declaration node if found, undefined otherwise
   * @private
   */
  private getClassNodeFromType(
    type: ts.Type,
    visitedTypes = new Set<ts.Type>(),
    typeName?: string
  ): ts.ClassDeclaration | undefined {
    // Prevent infinite recursion
    if (visitedTypes.has(type)) {
      return undefined
    }

    visitedTypes.add(type)

    // First check if it's an array type
    if (typeName && this.isArrayType(typeName)) {
      const elementType = this.getArrayElementType(type)
      if (elementType) {
        // Recursively call with the element type
        return this.getClassNodeFromType(elementType, visitedTypes)
      }
      return undefined
    }

    const symbol = type.getSymbol()
    if (!symbol) return undefined

    // Get the first declaration that is a class
    const declarations = symbol.getDeclarations()
    if (!declarations) return undefined

    for (const declaration of declarations) {
      if (ts.isClassDeclaration(declaration)) {
        return declaration
      }
    }

    return undefined
  }

  /**
   * Gets the class declaration node from a property's type.
   *
   * @param property - The property declaration
   * @returns The class declaration node if the property type is a class, undefined otherwise
   * @private
   */
  private getClassNodeFromProperty(
    property: ts.PropertyDeclaration,
    typeName: string
  ): ts.ClassDeclaration | undefined {
    const type = this.checker.getTypeAtLocation(property)
    return this.getClassNodeFromType(type, new Set(), typeName)
  }

  /**
   * Alternative method to get class information including source file.
   * Handles both direct class types and array element types.
   *
   * @param type - The TypeScript Type to analyze
   * @param visitedTypes - Set to track visited types and prevent infinite recursion
   * @returns Object with class node and source file information
   * @private
   */
  private getClassInfoFromType(
    type: ts.Type,
    visitedTypes = new Set<ts.Type>(),
    typeName: string
  ): {
    classNode: ts.ClassDeclaration | undefined
    sourceFile: ts.SourceFile | undefined
    className: string | undefined
    isArray: boolean
  } {
    // Prevent infinite recursion
    if (visitedTypes.has(type)) {
      return {
        classNode: undefined,
        sourceFile: undefined,
        className: undefined,
        isArray: false,
      }
    }
    visitedTypes.add(type)

    let isArray = false
    let actualType = type

    // Check if it's an array type
    if (this.isArrayType(typeName)) {
      isArray = true
      const elementType = this.getArrayElementType(type)
      if (elementType) {
        actualType = elementType
      } else {
        return {
          classNode: undefined,
          sourceFile: undefined,
          className: undefined,
          isArray,
        }
      }
    }

    const symbol = actualType.getSymbol()
    if (!symbol) {
      return {
        classNode: undefined,
        sourceFile: undefined,
        className: undefined,
        isArray,
      }
    }

    const declarations = symbol.getDeclarations()
    if (!declarations) {
      return {
        classNode: undefined,
        sourceFile: undefined,
        className: undefined,
        isArray,
      }
    }

    for (const declaration of declarations) {
      if (ts.isClassDeclaration(declaration)) {
        return {
          classNode: declaration,
          sourceFile: declaration.getSourceFile(),
          className: declaration.name?.text,
          isArray,
        }
      }
    }

    return {
      classNode: undefined,
      sourceFile: undefined,
      className: undefined,
      isArray,
    }
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
  return SchemaTransformer.transformClass(cls, options)
}

// Export types and interfaces for public use
export { SchemaTransformer }
