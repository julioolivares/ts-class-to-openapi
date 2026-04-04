import ts from 'typescript'
import {
  DecoratorInfo,
  Property,
  PropertyInfo,
  SchemaType,
  TransformerOptions,
} from './types.js'
import { constants } from './transformer.fixtures.js'

export class SchemaTransformer {
  private static instance: SchemaTransformer | null | undefined = null

  private program: ts.Program

  private checker: ts.TypeChecker

  private classCache: WeakMap<Function, any> = new WeakMap<Function, any>()

  private readonly maxCacheSize: number

  private readonly autoCleanup: boolean

  private classFileIndex = new Map<
    string,
    { sourceFile: ts.SourceFile; node: ts.ClassDeclaration }[]
  >()

  private transformCallIndex = new Map<string, Map<string, string>>()
  private nonGenericTransformCalls = new Set<string>()

  private constructor(
    tsConfigPath: string = constants.TS_CONFIG_DEFAULT_PATH,
    options: TransformerOptions = {}
  ) {
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

    this.buildTransformCallIndex()
  }

  private getPropertiesByClassDeclaration(
    classNode: ts.ClassDeclaration,
    visitedDeclarations: Set<ts.ClassDeclaration> = new Set<ts.ClassDeclaration>(),
    genericTypeMap: Map<string, string> = new Map()
  ): PropertyInfo[] {
    if (visitedDeclarations.has(classNode)) {
      return [] as PropertyInfo[]
    }

    visitedDeclarations.add(classNode)

    // if no heritage clauses, get properties directly from class
    if (!classNode.heritageClauses) {
      return this.getPropertiesByClassMembers(
        classNode.members,
        classNode,
        genericTypeMap
      )
    } // use heritage clauses to get properties from base classes
    else {
      const heritageClause = classNode.heritageClauses[0]

      if (
        heritageClause &&
        heritageClause.token === ts.SyntaxKind.ExtendsKeyword
      ) {
        const type = heritageClause.types[0]
        let properties: PropertyInfo[] = []
        let baseProperties: PropertyInfo[] = []

        if (!type) return [] as PropertyInfo[]

        const symbol = this.checker.getSymbolAtLocation(type.expression)
        if (!symbol) return [] as PropertyInfo[]

        const declaration = symbol.declarations?.[0]

        if (declaration && ts.isClassDeclaration(declaration)) {
          const newGenericTypeMap = new Map<string, string>()

          if (declaration.typeParameters && type.typeArguments) {
            declaration.typeParameters.forEach((param, index) => {
              const arg = type.typeArguments![index]
              if (arg) {
                const resolvedArg = this.getTypeNodeToString(
                  arg,
                  genericTypeMap
                )
                newGenericTypeMap.set(param.name.text, resolvedArg)
              }
            })
          }

          baseProperties = this.getPropertiesByClassDeclaration(
            declaration,
            visitedDeclarations,
            newGenericTypeMap
          )
        }

        properties = this.getPropertiesByClassMembers(
          classNode.members,
          classNode,
          genericTypeMap
        )

        return baseProperties.concat(properties)
      } else {
        return this.getPropertiesByClassMembers(
          classNode.members,
          classNode,
          genericTypeMap
        )
      }
    }
  }

  private getPropertiesByClassMembers(
    members: ts.NodeArray<ts.ClassElement>,
    parentClassNode?: ts.ClassDeclaration,
    genericTypeMap: Map<string, string> = new Map()
  ) {
    const properties: PropertyInfo[] = []

    for (const member of members) {
      if (
        ts.isPropertyDeclaration(member) &&
        (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
      ) {
        // Skip static, private, and protected properties
        if (member.modifiers) {
          const hasExcludedModifier = member.modifiers.some(
            m =>
              // m.kind === ts.SyntaxKind.StaticKeyword ||
              m.kind === ts.SyntaxKind.PrivateKeyword ||
              m.kind === ts.SyntaxKind.ProtectedKeyword
          )
          if (hasExcludedModifier) continue
        }

        const propertyName = member.name.text
        const type = this.getPropertyType(member, genericTypeMap)
        const decorators = this.extractDecorators(member)
        const isOptional = !!member.questionToken
        const isGeneric = this.isPropertyTypeGeneric(member)
        const isEnum = this.isEnum(member)
        const isPrimitive = this.isPrimitiveType(type) || isEnum
        const isClassType = this.isClassType(member)
        const isArray = this.isArrayProperty(member)
        const isTypeLiteral = this.isTypeLiteral(member)

        let genericClassReference: ts.ClassDeclaration | undefined = undefined
        if (isGeneric && !isPrimitive) {
          const baseTypeName = type.replace(/\[\]$/, '').trim()
          if (!this.isPrimitiveType(baseTypeName)) {
            const matches = this.classFileIndex.get(baseTypeName)
            if (matches && matches.length > 0 && matches[0]) {
              genericClassReference = matches[0].node
            }
          }
        }

        const property: PropertyInfo = {
          name: propertyName,
          type,
          decorators,
          isOptional,
          isGeneric,
          originalProperty: member,
          isPrimitive,
          isClassType,
          isArray,
          isEnum,
          isRef: false,
          isTypeLiteral: isTypeLiteral,
          genericClassReference,
        }

        // Check for self-referencing properties to mark as $ref
        if (property.isClassType) {
          const declaration = this.getDeclarationProperty(
            property
          ) as ts.ClassDeclaration

          if (parentClassNode) {
            if (
              declaration &&
              declaration.name &&
              this.checker.getSymbolAtLocation(declaration.name as ts.Node) ===
                this.checker.getSymbolAtLocation(
                  parentClassNode.name as ts.Node
                )
            ) {
              property.isRef = true
            }
          }
        }

        if (
          property.isTypeLiteral &&
          property.originalProperty.type !== undefined &&
          ts.isTypeReferenceNode(property.originalProperty.type) &&
          property.originalProperty.type.typeArguments?.length === 1
        ) {
          const typeArguments = property.originalProperty.type.typeArguments

          if (typeArguments && typeArguments[0]) {
            const firstTypeArg = typeArguments[0]

            if (ts.isTypeReferenceNode(firstTypeArg)) {
              const type = this.checker.getTypeAtLocation(firstTypeArg)
              const symbol = type.getSymbol()

              if (symbol && symbol.declarations) {
                const classDeclaration = symbol.declarations.find(decl =>
                  ts.isClassDeclaration(decl)
                )

                if (
                  classDeclaration &&
                  ts.isClassDeclaration(classDeclaration)
                ) {
                  property.typeLiteralClassReference = classDeclaration
                }
              }
            }
          }
        }

        properties.push(property)
      }
    }

    return properties
  }

  private getPropertyType(
    property: ts.PropertyDeclaration,
    genericTypeMap: Map<string, string> = new Map()
  ): string {
    if (property.type) {
      return this.getTypeNodeToString(property.type, genericTypeMap)
    }

    const type = this.checker.getTypeAtLocation(property)
    return this.checker.typeToString(type)
  }

  private getTypeNodeToString(
    typeNode: ts.TypeNode,
    genericTypeMap: Map<string, string> = new Map()
  ): string {
    if (ts.isTypeReferenceNode(typeNode)) {
      // Resolve qualified names like `mod.ClassName` — use only the rightmost identifier
      let typeName: string

      if (ts.isIdentifier(typeNode.typeName)) {
        typeName = typeNode.typeName.text
      } else {
        // ts.QualifiedName — use the rightmost identifier (e.g., mod.ClassName → ClassName)
        typeName = typeNode.typeName.right.text
      }

      if (genericTypeMap.has(typeName)) {
        return genericTypeMap.get(typeName)!
      }

      if (typeName.toLowerCase() === 'uploadfile') {
        return 'UploadFile'
      }

      if (typeName.toLowerCase() === 'uploadfiledto') {
        return 'UploadFileDto'
      }

      if (typeNode.typeArguments && typeNode.typeArguments.length > 0) {
        // Array<T> — resolve the inner type through genericTypeMap instead of
        // calling the type-checker, which can't see through the generic param.
        if (typeName === 'Array') {
          const innerType = this.getTypeNodeToString(
            typeNode.typeArguments[0]!,
            genericTypeMap
          )
          return `${innerType}[]`
        }

        const firstTypeArg = typeNode.typeArguments[0]
        if (
          firstTypeArg &&
          ts.isTypeReferenceNode(firstTypeArg) &&
          ts.isIdentifier(firstTypeArg.typeName)
        ) {
          if (firstTypeArg.typeName.text.toLowerCase() === 'uploadfile') {
            return 'UploadFile'
          }
        }

        return this.resolveGenericType(typeNode)
      }

      return typeName
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
        return `${this.getTypeNodeToString(
          arrayType.elementType,
          genericTypeMap
        )}[]`
      case ts.SyntaxKind.UnionType:
        // Handle union types like string | null
        const unionType = typeNode as ts.UnionTypeNode
        const types = unionType.types.map(t =>
          this.getTypeNodeToString(t, genericTypeMap)
        )
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
      default: {
        // depending on getText() which can fail on synthetic/detached nodes.
        // access types, type aliases, and other complex nodes reliably without
        // Use the type-checker as the primary fallback — it resolves indexed
        const resolvedType = this.checker.getTypeAtLocation(typeNode)
        const resolved = this.checker.typeToString(resolvedType)

        // Check if this is a generic type parameter we can resolve
        if (genericTypeMap && genericTypeMap.has(resolved)) {
          return genericTypeMap.get(resolved)!
        }

        if (this.isPrimitiveType(resolved)) {
          return resolved
        }

        // For non-primitive resolved types, check if it maps to a known type
        if (resolved === 'Date') return constants.jsPrimitives.Date.type
        if (resolved === 'Buffer') return constants.jsPrimitives.Buffer.type
        if (resolved === 'Uint8Array')
          return constants.jsPrimitives.Uint8Array.type

        return resolved
      }
    }
  }

  private resolveGenericType(typeNode: ts.TypeReferenceNode): string {
    let typeName: string
    if (ts.isIdentifier(typeNode.typeName)) {
      typeName = typeNode.typeName.text
    } else {
      typeName = typeNode.typeName.right.text
    }
    const typeArguments = typeNode.typeArguments

    if (!typeArguments || typeArguments.length === 0) {
      return typeName
    }

    const type = this.checker.getTypeAtLocation(typeNode)

    // Only use the checker's resolved type if it is concrete (not 'any').
    // Using type flags instead of string matching avoids false rejections
    // for types whose names contain the substring 'any' (e.g. Company).
    if (!(type.flags & ts.TypeFlags.Any)) {
      const resolvedType = this.checker.typeToString(type)
      if (resolvedType && resolvedType !== typeName) {
        return resolvedType
      }
    }

    return typeName
  }

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

  private getDecoratorName(callExpression: ts.CallExpression): string {
    if (ts.isIdentifier(callExpression.expression)) {
      return callExpression.expression.text
    }
    // Support namespaced decorators like @validators.IsString()
    if (ts.isPropertyAccessExpression(callExpression.expression)) {
      return callExpression.expression.name.text
    }
    return 'unknown'
  }

  private getDecoratorArguments(callExpression: ts.CallExpression): any[] {
    return callExpression.arguments.map(arg => {
      if (ts.isNumericLiteral(arg)) return Number(arg.text)
      if (ts.isStringLiteral(arg)) return arg.text
      if (arg.kind === ts.SyntaxKind.TrueKeyword) return true
      if (arg.kind === ts.SyntaxKind.FalseKeyword) return false
      return arg
    })
  }

  private getSafeDecoratorArgument(arg: any): any {
    if (arg && typeof arg === 'object' && 'kind' in arg) {
      const node = arg as ts.Node
      // Use the type-checker to evaluate constant values safely
      // instead of getText() which fails on detached/synthetic nodes
      const type = this.checker.getTypeAtLocation(node)
      if (type.isNumberLiteral()) {
        return type.value
      }
      if (type.isStringLiteral()) {
        return type.value
      }
      // Fallback to typeToString for non-literal resolved types
      return this.checker.typeToString(type)
    }
    return arg
  }

  private isPropertyTypeGeneric(property: ts.PropertyDeclaration): boolean {
    if (property.type && this.isGenericTypeFromNode(property.type)) {
      return true
    }

    try {
      const type = this.checker.getTypeAtLocation(property)
      return this.isGenericTypeFromSymbol(type)
    } catch (error) {
      console.warn('Error analyzing property type for generics:', error)
      return false
    }
  }

  private isGenericTypeFromNode(typeNode: ts.TypeNode): boolean {
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
    if (
      type.flags & ts.TypeFlags.Object &&
      (type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference
    ) {
      const typeArgs = this.checker.getTypeArguments(type as ts.TypeReference)
      if (
        typeArgs.length > 0 &&
        typeArgs[0]?.getSymbol()?.getName() === 'Array'
      ) {
        const symbol = type.getSymbol()
        if (symbol && symbol.getName() === 'Array') {
          // This is Array<T> - only consider it generic if T itself is a utility type
          const elementType = typeArgs[0]
          return elementType ? this.isUtilityTypeFromType(elementType) : false
        }

        const elementType = typeArgs[0]
        return elementType ? this.isUtilityTypeFromType(elementType) : false
      }
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

  private isSimpleArrayType(type: ts.Type): boolean {
    const symbol = type.getSymbol()
    if (!symbol || symbol.getName() !== 'Array') {
      return false
    }

    // Check if this is Array<T> where T is a simple, non-generic type
    if (
      type.flags & ts.TypeFlags.Object &&
      (type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference
    ) {
      const typeArgs = this.checker.getTypeArguments(type as ts.TypeReference)
      if (typeArgs.length === 1) {
        const elementType = typeArgs[0]!

        // If the element type is a utility type, then this array should be considered generic
        if (this.isUtilityTypeFromType(elementType)) {
          return false
        }

        // If the element type itself has generic parameters, this array is generic
        if (
          elementType.flags & ts.TypeFlags.Object &&
          (elementType as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference
        ) {
          const elementTypeArgs = this.checker.getTypeArguments(
            elementType as ts.TypeReference
          )
          if (elementTypeArgs.length > 0) {
            return false
          }
        }

        const elementSymbol = elementType.getSymbol()
        if (elementSymbol && elementSymbol.getName() !== 'Array') {
          return false
        }

        return true
      }
    }

    return false
  }

  private isPrimitiveType(typeName: string): boolean {
    const lowerTypeName = typeName.toLowerCase()

    const primitiveTypes = [
      constants.jsPrimitives.String.type.toLowerCase(),
      constants.jsPrimitives.Number.type.toLowerCase(),
      constants.jsPrimitives.Boolean.type.toLowerCase(),
      constants.jsPrimitives.Date.type.toLowerCase(),
      constants.jsPrimitives.Buffer.type.toLowerCase(),
      constants.jsPrimitives.Uint8Array.type.toLowerCase(),
      constants.jsPrimitives.File.type.toLowerCase(),
      constants.jsPrimitives.UploadFile.type.toLowerCase(),
      constants.jsPrimitives.UploadFileDto.type.toLowerCase(),
      constants.jsPrimitives.BigInt.type.toLowerCase(),
      constants.jsPrimitives.Symbol.type.toLowerCase(),
      constants.jsPrimitives.null.type.toLowerCase(),
      constants.jsPrimitives.Object.type.toLowerCase(),
      constants.jsPrimitives.Array.type.toLowerCase(),
      constants.jsPrimitives.Any.type.toLowerCase(),
      constants.jsPrimitives.Unknown.type.toLowerCase(),
    ]

    const primitivesArray = primitiveTypes.map(t => t.concat('[]'))

    return (
      primitiveTypes.includes(lowerTypeName) ||
      primitivesArray.includes(lowerTypeName)
    )
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

  private getSourceFileByClass(
    cls: Function,
    sourceOptions?: {
      isExternal: boolean
      packageName: string
      filePath?: string
    }
  ): { sourceFile: ts.SourceFile; node: ts.ClassDeclaration } | undefined {
    const className = cls.name
    let matches: { sourceFile: ts.SourceFile; node: ts.ClassDeclaration }[] = []

    if (sourceOptions?.isExternal) {
      const sourceFiles = this.getFilteredSourceFiles(sourceOptions)
      for (const sourceFile of sourceFiles) {
        const node = sourceFile.statements.find(
          stmt =>
            ts.isClassDeclaration(stmt) &&
            stmt.name &&
            stmt.name.text === className
        ) as ts.ClassDeclaration | undefined

        if (node) {
          matches.push({ sourceFile, node })
        }
      }
    } else {
      matches = this.classFileIndex.get(className) || []
      if (sourceOptions?.filePath) {
        matches = matches.filter(m =>
          m.sourceFile.fileName.includes(sourceOptions.filePath!)
        )
      }
    }

    if (matches.length === 0) {
      return undefined
    }

    if (matches.length === 1) {
      return matches[0]
    }

    if (matches.length > 1 && !sourceOptions?.filePath) {
      const bestMatch = this.findBestMatch(cls, matches)

      if (bestMatch) {
        return bestMatch
      }

      const firstMatch = matches[0]
      if (firstMatch) {
        console.warn(
          `[ts-class-to-openapi] Warning: Found multiple classes with name '${className}'. Using the first one found in '${firstMatch.sourceFile.fileName}'. To resolve this collision, provide 'sourceOptions.filePath'.`
        )
      }
    }

    return matches[0]
  }

  private findBestMatch(
    cls: Function,
    matches: { sourceFile: ts.SourceFile; node: ts.ClassDeclaration }[]
  ): { sourceFile: ts.SourceFile; node: ts.ClassDeclaration } | undefined {
    // Extract property names from the runtime class without instantiation
    // to avoid executing potentially unsafe constructors with side effects
    const runtimeProps = this.extractRuntimePropertyNames(cls)

    let bestMatch:
      | { sourceFile: ts.SourceFile; node: ts.ClassDeclaration }
      | undefined
    let bestScore = -1

    for (const match of matches) {
      let score = 0
      for (const member of match.node.members) {
        if (
          ts.isPropertyDeclaration(member) &&
          member.name &&
          (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
        ) {
          if (runtimeProps.has(member.name.text)) score++
        }
      }
      if (score > bestScore) {
        bestScore = score
        bestMatch = match
      }
    }

    return bestMatch
  }

  /**
   * Safely extracts property names from a class constructor without instantiation.
   * Parses the class source via Function.prototype.toString() and inspects
   * the prototype for method names.
   */
  private extractRuntimePropertyNames(cls: Function): Set<string> {
    const names = new Set<string>()

    // Parse property names from the class source (safe: toString() is pure)
    try {
      const source = Function.prototype.toString.call(cls)
      // Match constructor-compiled field assignments: this.propName = ...
      const thisAssign = /this\.(\w+)\s*=/g
      let m: RegExpExecArray | null
      while ((m = thisAssign.exec(source)) !== null) {
        if (m[1]) names.add(m[1])
      }
      // Match class-field declarations in both minified and multiline output.
      // Fields appear after `}` or `;` terminators: fieldName= or fieldName; or fieldName}
      const classField = /[;}](\w+)(?=[=;}\s])/g
      while ((m = classField.exec(source)) !== null) {
        if (m[1] && !constants.JS_KEYWORDS.has(m[1])) {
          names.add(m[1])
        }
      }
    } catch {
      // toString() might be unavailable for some class types
    }

    // Include prototype members (methods, getters) — safe, no instantiation
    try {
      for (const name of Object.getOwnPropertyNames(cls.prototype)) {
        if (name !== 'constructor') names.add(name)
      }
    } catch {
      // prototype might not be accessible
    }

    return names
  }

  private getFilteredSourceFiles(sourceOptions?: {
    isExternal: boolean
    packageName: string
    filePath?: string
  }): ts.SourceFile[] {
    if (sourceOptions?.isExternal) {
      return this.program.getSourceFiles().filter(sf => {
        return (
          sf.fileName.includes(sourceOptions.packageName) &&
          (!sourceOptions.filePath || sf.fileName === sourceOptions.filePath)
        )
      })
    }

    return this.program.getSourceFiles().filter(sf => {
      if (
        sourceOptions?.filePath &&
        !sf.fileName.includes(sourceOptions.filePath)
      ) {
        return false
      }

      return true
    })
  }

  private isEnum(propertyDeclaration: ts.PropertyDeclaration): boolean {
    if (!propertyDeclaration.type) {
      return false
    }

    let typeNode = propertyDeclaration.type

    if (ts.isArrayTypeNode(typeNode)) {
      typeNode = typeNode.elementType
    }

    // Handle nullable enums: unwrap union types like `Status | null`
    if (ts.isUnionTypeNode(typeNode)) {
      const nonNullTypes = typeNode.types.filter(
        t =>
          t.kind !== ts.SyntaxKind.NullKeyword &&
          t.kind !== ts.SyntaxKind.UndefinedKeyword
      )
      if (nonNullTypes.length === 1 && nonNullTypes[0]) {
        typeNode = nonNullTypes[0]
      }
    }

    if (ts.isTypeReferenceNode(typeNode)) {
      const type = this.checker.getTypeAtLocation(typeNode)
      return !!(type.flags & ts.TypeFlags.EnumLike)
    }

    return false
  }

  /**
   * Resolves a type node to its underlying symbol via the type-checker.
   * For type references with type arguments (e.g., PayloadEntity<Person>),
   * it checks the first type argument for a class declaration first.
   * Returns the ts.Symbol or undefined.
   */
  private resolveClassSymbolFromTypeNode(
    typeNode: ts.TypeNode
  ): ts.Symbol | undefined {
    // Priority: if this is a generic wrapper (PayloadEntity<Person>), resolve the inner class
    if (
      ts.isTypeReferenceNode(typeNode) &&
      typeNode.typeArguments &&
      typeNode.typeArguments.length > 0
    ) {
      const firstTypeArg = typeNode.typeArguments[0]
      if (firstTypeArg) {
        const argType = this.checker.getTypeAtLocation(firstTypeArg)
        const argSymbol = argType.getSymbol()
        if (argSymbol && argSymbol.declarations) {
          const hasClass = argSymbol.declarations.some(decl =>
            ts.isClassDeclaration(decl)
          )
          if (hasClass) return argSymbol
        }
      }
    }

    // Fallback: resolve the type node directly
    const type = this.checker.getTypeAtLocation(typeNode)
    return type.getSymbol() ?? undefined
  }

  /**
   * Resolves the element type node from an array property declaration.
   * Handles both `T[]` and `Array<T>` syntax.
   */
  private resolveArrayElementTypeNode(
    propertyDeclaration: ts.PropertyDeclaration
  ): ts.TypeNode | undefined {
    if (!propertyDeclaration.type) return undefined

    if (ts.isArrayTypeNode(propertyDeclaration.type)) {
      return propertyDeclaration.type.elementType
    }
    if (
      ts.isTypeReferenceNode(propertyDeclaration.type) &&
      propertyDeclaration.type.typeArguments?.[0]
    ) {
      return propertyDeclaration.type.typeArguments[0]
    }
    return undefined
  }

  private isClassType(propertyDeclaration: ts.PropertyDeclaration): boolean {
    if (!propertyDeclaration.type) {
      return false
    }

    // Determine the type node to resolve — for arrays, use the element type
    const typeNode = this.isArrayProperty(propertyDeclaration)
      ? this.resolveArrayElementTypeNode(propertyDeclaration)
      : propertyDeclaration.type

    if (!typeNode) return false

    const symbol = this.resolveClassSymbolFromTypeNode(typeNode)
    if (symbol && symbol.declarations) {
      return symbol.declarations.some(decl => ts.isClassDeclaration(decl))
    }

    return false
  }

  private getDeclarationProperty(
    property: PropertyInfo
  ): ts.Declaration | undefined {
    if (!property.originalProperty.type) {
      return undefined
    }

    // Determine the type node to resolve — for arrays, use the element type
    const typeNode = ts.isArrayTypeNode(property.originalProperty.type)
      ? property.originalProperty.type.elementType
      : property.originalProperty.type

    const symbol = this.resolveClassSymbolFromTypeNode(typeNode)

    if (symbol && symbol.declarations) {
      return (
        symbol.declarations.find(decl => ts.isClassDeclaration(decl)) ??
        symbol.declarations[0]
      )
    }

    return undefined
  }

  private isArrayProperty(
    propertyDeclaration: ts.PropertyDeclaration
  ): boolean {
    if (!propertyDeclaration.type) {
      return false
    }

    if (ts.isArrayTypeNode(propertyDeclaration.type)) {
      return true
    }

    // Also handle Array<T> generic syntax
    if (
      ts.isTypeReferenceNode(propertyDeclaration.type) &&
      ts.isIdentifier(propertyDeclaration.type.typeName) &&
      propertyDeclaration.type.typeName.text === 'Array'
    ) {
      return true
    }

    return false
  }

  private getSchemaFromProperties({
    properties,
    visitedClass,
    transformedSchema,
    classDeclaration,
  }: {
    properties: PropertyInfo[]
    visitedClass?: Set<ts.ClassDeclaration>
    transformedSchema?: Map<string, Property>
    classDeclaration: ts.ClassDeclaration
  }): Record<string, Property> {
    let schema: Record<string, Property> = {}
    const required: string[] = []

    for (const property of properties) {
      schema[property.name] = this.getSchemaFromProperty({
        property,
        visitedClass,
        transformedSchema,
        classDeclaration,
      })

      // this.applyDecorators(property, schema as SchemaType)

      if (!property.isOptional) {
        required.push(property.name)
      }
    }

    return {
      type: 'object',
      properties: schema,
      required: required.length ? required : undefined,
    } as SchemaType
  }

  private getSchemaFromProperty({
    property,
    visitedClass,
    transformedSchema,
    classDeclaration,
  }: {
    property: PropertyInfo
    visitedClass?: Set<ts.ClassDeclaration> | undefined
    transformedSchema?: Map<string, Property> | undefined
    classDeclaration: ts.ClassDeclaration
  }): Property {
    let schema: Property = {} as Property

    if (property.isPrimitive) {
      schema = this.getSchemaFromPrimitive(property)
    } else if (property.isClassType) {
      schema = this.buildSchemaFromClass({
        property,
        classDeclaration,
        visitedClass,
        transformedSchema,
      })
    } else if (property.isTypeLiteral && property.typeLiteralClassReference) {
      schema = this.buildSchemaFromClass({
        property,
        classDeclaration: property.typeLiteralClassReference,
        visitedClass,
        transformedSchema,
      })
    } else if (property.isGeneric) {
      if (property.genericClassReference) {
        schema = this.getSchemaFromClass({
          isArray: property.isArray as boolean,
          visitedClass,
          transformedSchema,
          declaration: property.genericClassReference,
        })
      } else {
        const inner = {
          type: 'object',
          properties: {},
          additionalProperties: true,
        }
        schema = property.isArray ? { type: 'array', items: inner } : inner
      }
    } else {
      const inner = {
        type: 'object',
        properties: {},
        additionalProperties: true,
      }
      schema = property.isArray ? { type: 'array', items: inner } : inner
    }

    this.applyDecorators(property, schema as SchemaType)

    return schema
  }

  private buildSchemaFromClass({
    property,
    classDeclaration,
    visitedClass,
    transformedSchema,
  }: {
    property: PropertyInfo
    classDeclaration: ts.ClassDeclaration
    visitedClass: Set<ts.ClassDeclaration> | undefined
    transformedSchema: Map<string, Property> | undefined
  }) {
    const declaration = this.getDeclarationProperty(
      property
    ) as ts.ClassDeclaration
    let schema: Property = {} as Property

    if (property.isRef && classDeclaration.name) {
      // Self-referencing property, handle as a reference to avoid infinite recursion
      if (property.isArray) {
        schema.type = 'array'
        schema.items = {
          $ref: `#/components/schemas/${classDeclaration.name.text}`,
        } as Property
      } else {
        schema = {
          $ref: `#/components/schemas/${classDeclaration.name.text}`,
        } as Property
      }
    } else if (property.isTypeLiteral && property.typeLiteralClassReference) {
      schema = this.getSchemaFromClass({
        isArray: property.isArray as boolean,
        visitedClass,
        transformedSchema,
        declaration: property.typeLiteralClassReference,
      })
    } else {
      schema = this.getSchemaFromClass({
        isArray: property.isArray as boolean,
        visitedClass,
        transformedSchema,
        declaration,
      })
    }

    return schema
  }

  private getSchemaFromClass({
    transformedSchema = new Map(),
    visitedClass = new Set(),
    declaration,
    isArray,
  }: {
    visitedClass?: Set<ts.ClassDeclaration> | undefined
    transformedSchema?: Map<string, Property> | undefined
    declaration: ts.Declaration | undefined
    isArray: boolean
  }): Property {
    let schema: Property = { type: 'object' } as Property

    if (
      !declaration ||
      !ts.isClassDeclaration(declaration) ||
      !declaration.name
    ) {
      return { type: 'object' }
    }

    if (visitedClass.has(declaration)) {
      if (isArray) {
        schema.type = 'array'
        schema.items = {
          $ref: `#/components/schemas/${declaration.name.text}`,
        } as Property
      } else {
        schema = {
          $ref: `#/components/schemas/${declaration.name.text}`,
        } as Property
      }

      return schema
    }

    visitedClass.add(declaration)

    const properties = this.getPropertiesByClassDeclaration(declaration)

    let transformerProps = this.getSchemaFromProperties({
      properties,
      visitedClass,
      transformedSchema: transformedSchema,
      classDeclaration: declaration,
    }) as SchemaType

    if (isArray) {
      schema.type = 'array'
      schema.items = {
        type: transformerProps.type,
        properties: transformerProps.properties,
        required: transformerProps.required,
      }
    } else {
      schema.type = transformerProps.type
      schema.properties = transformerProps.properties
      schema.required = transformerProps.required
    }

    transformedSchema.set(declaration.name.text, schema)

    visitedClass.delete(declaration)

    return schema
  }

  private getSchemaFromEnum(property: PropertyInfo): Property | undefined {
    let typeNode = property.originalProperty.type!
    if (ts.isArrayTypeNode(typeNode)) {
      typeNode = typeNode.elementType
    }

    const type = this.checker.getTypeAtLocation(typeNode)
    if (type.symbol && type.symbol.exports) {
      const values: (string | number)[] = []
      type.symbol.exports.forEach(member => {
        const declaration = member.valueDeclaration
        if (declaration && ts.isEnumMember(declaration)) {
          const value = this.checker.getConstantValue(declaration)
          if (value !== undefined) {
            values.push(value)
          }
        }
      })

      if (values.length > 0) {
        const propertySchema = { type: 'object' } as Property
        propertySchema.enum = values
        const isString = values.every(v => typeof v === 'string')
        const isNumber = values.every(v => typeof v === 'number')

        if (isString) {
          propertySchema.type = 'string'
        } else if (isNumber) {
          propertySchema.type = 'number'
        } else {
          propertySchema.type = 'string'
        }

        if (property.isArray) {
          const itemsSchema = { ...propertySchema }
          propertySchema.type = 'array'
          propertySchema.items = itemsSchema
          delete propertySchema.enum
          return propertySchema
        } else {
          return propertySchema
        }
      }
    }
    return undefined
  }

  private getSchemaFromPrimitive(property: PropertyInfo): Property {
    if (property.isEnum) {
      const enumSchema = this.getSchemaFromEnum(property)
      if (enumSchema) {
        return enumSchema
      }
    }

    const propertySchema = { type: 'object' } as Property

    // Resolve the base type name via the TS type-checker for safety.
    // For arrays, resolve the element type node instead of the full property.
    let baseTypeNode: ts.TypeNode | undefined = property.originalProperty.type
    if (property.isArray && baseTypeNode) {
      baseTypeNode =
        this.resolveArrayElementTypeNode(property.originalProperty) ??
        baseTypeNode
    }

    const resolvedType = this.checker.getTypeAtLocation(
      baseTypeNode ?? property.originalProperty
    )

    let propertyType: string
    if (resolvedType.flags & ts.TypeFlags.TypeParameter) {
      // Unresolved generic type parameter — the checker can't see through
      // our runtime genericTypeMap, so fall back to the already-resolved
      // property.type string (which went through getTypeNodeToString).
      propertyType = property.type.toLowerCase().replace(/\[\]$/, '').trim()
    } else {
      propertyType = this.checker.typeToString(resolvedType).toLowerCase()
    }

    let isFile = false

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
      case constants.jsPrimitives.Date.type.toLocaleLowerCase():
        propertySchema.type = constants.jsPrimitives.Date.value
        propertySchema.format = constants.jsPrimitives.Date.format
        break
      case constants.jsPrimitives.Buffer.type.toLocaleLowerCase():
      case constants.jsPrimitives.Uint8Array.type.toLocaleLowerCase():
      case constants.jsPrimitives.File.type.toLocaleLowerCase():
      case constants.jsPrimitives.UploadFile.type.toLocaleLowerCase():
      case constants.jsPrimitives.UploadFileDto.type.toLocaleLowerCase():
        propertySchema.type = constants.jsPrimitives.UploadFile.value
        propertySchema.format = constants.jsPrimitives.UploadFile.format
        isFile = true
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
      case 'unknown':
      case 'any':
        propertySchema.type = constants.jsPrimitives.Object.value
        ;(propertySchema as Record<string, unknown>).additionalProperties = true
        break
      default:
        propertySchema.type = constants.jsPrimitives.String.value
    }

    if (property.isArray) {
      delete propertySchema.format
      const resolvedItemType = propertySchema.type
      const itemSchema: Record<string, unknown> = {
        type: isFile
          ? constants.jsPrimitives.UploadFile.value
          : resolvedItemType,
        format: isFile
          ? constants.jsPrimitives.UploadFile.format
          : propertySchema.format,
      }
      if ((propertySchema as Record<string, unknown>).additionalProperties) {
        itemSchema.additionalProperties = true
        delete (propertySchema as Record<string, unknown>).additionalProperties
      }
      propertySchema.type = `array`
      propertySchema.items = itemSchema
    }

    return propertySchema
  }

  private isTypeLiteral(property: ts.PropertyDeclaration): boolean {
    if (!property.type) return false

    if (ts.isTypeReferenceNode(property.type)) {
      const symbol = this.checker.getSymbolAtLocation(property.type.typeName)

      if (symbol) {
        const declarations = symbol.getDeclarations()

        if (declarations && declarations.length > 0) {
          const typeAliasDecl = declarations.find(decl =>
            ts.isTypeAliasDeclaration(decl)
          ) as ts.TypeAliasDeclaration

          if (typeAliasDecl && typeAliasDecl.type) {
            return this.isLiteralTypeNode(typeAliasDecl.type)
          }
        }
      }
    }

    return false
  }

  /**
   *
   * @param typeNode
   * @returns boolean - true si el typeNode representa un tipo literal complejo
   */
  private isLiteralTypeNode(typeNode: ts.TypeNode): boolean {
    return (
      ts.isIntersectionTypeNode(typeNode) || // {} & Omit<T, ...>
      ts.isUnionTypeNode(typeNode) || // string | number
      ts.isMappedTypeNode(typeNode) || // { [K in keyof T]: ... }
      ts.isTypeLiteralNode(typeNode) || // { foo: string }
      ts.isConditionalTypeNode(typeNode) || // T extends U ? X : Y
      ts.isIndexedAccessTypeNode(typeNode) || // T['key']
      ts.isTypeOperatorNode(typeNode) || // keyof T, readonly T
      ts.isTypeReferenceNode(typeNode) // Omit, Pick, Partial, etc.
    )
  }

  private applyEnumDecorator(
    decorator: DecoratorInfo,
    schema: SchemaType
  ): void {
    if (decorator.arguments.length === 0) return

    const arg = decorator.arguments[0]

    if (arg && typeof arg === 'object' && 'kind' in arg) {
      // Handle inline array literals (e.g., @IsEnum(['admin', 'user', 'moderator']))
      if (ts.isArrayLiteralExpression(arg as ts.Node)) {
        const values = this.extractValuesFromArrayLiteral(
          arg as ts.ArrayLiteralExpression
        )
        if (values.length > 0) {
          this.applyEnumValues(values, schema)
        }
        return
      }

      const type = this.checker.getTypeAtLocation(arg as ts.Node)

      // Handle real TypeScript enums (type.symbol.exports contains EnumMembers)
      if (type.symbol && type.symbol.exports) {
        const values: (string | number)[] = []

        type.symbol.exports.forEach(member => {
          const declaration = member.valueDeclaration
          if (declaration && ts.isEnumMember(declaration)) {
            const value = this.checker.getConstantValue(declaration)
            if (value !== undefined) {
              values.push(value)
            }
          }
        })

        if (values.length > 0) {
          this.applyEnumValues(values, schema)
          return
        }
      }

      // Handle literal object enums (e.g., const UserType = { ADMIN: 'admin', USER: 'user' })
      const values = this.extractValuesFromObjectLiteral(type)
      if (values.length > 0) {
        this.applyEnumValues(values, schema)
      }
    }
  }

  private extractValuesFromArrayLiteral(
    arrayLiteral: ts.ArrayLiteralExpression
  ): (string | number)[] {
    const values: (string | number)[] = []

    for (const element of arrayLiteral.elements) {
      if (ts.isStringLiteral(element)) {
        values.push(element.text)
      } else if (ts.isNumericLiteral(element)) {
        values.push(Number(element.text))
      } else if (
        ts.isPrefixUnaryExpression(element) &&
        element.operator === ts.SyntaxKind.MinusToken &&
        ts.isNumericLiteral(element.operand)
      ) {
        values.push(-Number(element.operand.text))
      }
    }

    return values
  }

  private extractValuesFromObjectLiteral(type: ts.Type): (string | number)[] {
    const values: (string | number)[] = []

    const properties = type.getProperties()
    if (!properties || properties.length === 0) return values

    for (const prop of properties) {
      const propType = this.checker.getTypeOfSymbolAtLocation(
        prop,
        prop.valueDeclaration!
      )

      if (propType.isStringLiteral()) {
        values.push(propType.value)
      } else if (propType.isNumberLiteral()) {
        values.push(propType.value)
      } else if (
        prop.valueDeclaration &&
        ts.isPropertyAssignment(prop.valueDeclaration)
      ) {
        // Fallback: extract value from AST initializer (for non-"as const" objects)
        const initializer = prop.valueDeclaration.initializer
        if (ts.isStringLiteral(initializer)) {
          values.push(initializer.text)
        } else if (ts.isNumericLiteral(initializer)) {
          values.push(Number(initializer.text))
        }
      }
    }

    return values
  }

  private applyEnumValues(
    values: (string | number)[],
    schema: SchemaType
  ): void {
    schema.enum = values
    const isString = values.every(v => typeof v === 'string')
    const isNumber = values.every(v => typeof v === 'number')

    if (isString) {
      schema.type = 'string'
    } else if (isNumber) {
      schema.type = 'number'
    } else {
      schema.type = 'string'
    }

    // Clean up object-type leftovers when enum is applied
    delete schema.properties
    delete schema.additionalProperties
  }

  private applyDecorators(property: PropertyInfo, schema: SchemaType): void {
    for (const decorator of property.decorators) {
      const decoratorName = decorator.name

      switch (decoratorName) {
        case constants.validatorDecorators.IsString.name:
          if (!property.isArray) {
            schema.type = constants.validatorDecorators.IsString.type
          } else if (schema.items) {
            schema.items.type = constants.validatorDecorators.IsString.type
          }
          break
        case constants.validatorDecorators.IsInt.name:
          if (!property.isArray) {
            schema.type = constants.validatorDecorators.IsInt.type
            schema.format = constants.validatorDecorators.IsInt.format
          } else if (schema.items) {
            schema.items.type = constants.validatorDecorators.IsInt.type
            schema.items.format = constants.validatorDecorators.IsInt.format
          }
          break
        case constants.validatorDecorators.IsNumber.name:
          if (!property.isArray) {
            schema.type = constants.validatorDecorators.IsNumber.type
          } else if (schema.items) {
            schema.items.type = constants.validatorDecorators.IsNumber.type
          }
          break
        case constants.validatorDecorators.IsBoolean.name:
          if (!property.isArray) {
            schema.type = constants.validatorDecorators.IsBoolean.type
          } else if (schema.items) {
            schema.items.type = constants.validatorDecorators.IsBoolean.type
          }
          break
        case constants.validatorDecorators.IsEmail.name:
          if (!property.isArray) {
            schema.format = constants.validatorDecorators.IsEmail.format
          } else if (schema.items) {
            schema.items.format = constants.validatorDecorators.IsEmail.format
          }
          break
        case constants.validatorDecorators.IsDate.name:
          if (!property.isArray) {
            schema.type = constants.validatorDecorators.IsDate.type
            schema.format = constants.validatorDecorators.IsDate.format
          } else if (schema.items) {
            schema.items.type = constants.validatorDecorators.IsDate.type
            schema.items.format = constants.validatorDecorators.IsDate.format
          }
          break
        case constants.validatorDecorators.IsNotEmpty.name:
          property.isOptional = false
          break
        case constants.validatorDecorators.IsOptional.name:
          property.isOptional = true
          break
        case constants.validatorDecorators.MinLength.name:
          schema.minLength = this.getSafeDecoratorArgument(
            decorator.arguments[0]
          )
          break
        case constants.validatorDecorators.MaxLength.name:
          schema.maxLength = this.getSafeDecoratorArgument(
            decorator.arguments[0]
          )
          break
        case constants.validatorDecorators.Length.name:
          schema.minLength = this.getSafeDecoratorArgument(
            decorator.arguments[0]
          )
          if (decorator.arguments[1]) {
            schema.maxLength = this.getSafeDecoratorArgument(
              decorator.arguments[1]
            )
          }
          break
        case constants.validatorDecorators.Min.name:
          schema.minimum = this.getSafeDecoratorArgument(decorator.arguments[0])
          break
        case constants.validatorDecorators.Max.name:
          schema.maximum = this.getSafeDecoratorArgument(decorator.arguments[0])
          break
        case constants.validatorDecorators.IsPositive.name:
          schema.minimum = 0
          break
        case constants.validatorDecorators.IsArray.name:
          schema.type = constants.jsPrimitives.Array.value
          break
        case constants.validatorDecorators.ArrayNotEmpty.name:
          schema.minItems = 1
          property.isOptional = false
          break
        case constants.validatorDecorators.ArrayMinSize.name:
          schema.minItems = this.getSafeDecoratorArgument(
            decorator.arguments[0]
          )
          break
        case constants.validatorDecorators.ArrayMaxSize.name:
          schema.maxItems = this.getSafeDecoratorArgument(
            decorator.arguments[0]
          )
          break
        case constants.validatorDecorators.IsEnum.name:
          if (!property.isArray) {
            this.applyEnumDecorator(decorator, schema)
          } else {
            if (!schema.items) {
              schema.type = 'array'
              schema.items = {} as SchemaType
            }
            this.applyEnumDecorator(decorator, schema.items)
          }
          break
      }
    }
  }

  /**
   * Scans all non-declaration source files in the program once and records
   * every call of the form `transform(Foo<Bar, Baz>)`, keyed by class name.
   * This means generic resolution in transform() is a pure O(1) Map lookup
   * with no runtime stack inspection.
   */
  private buildTransformCallIndex(): void {
    this.program.getSourceFiles().forEach(sf => {
      if (sf.isDeclarationFile) return

      // Build classFileIndex and transformCallIndex in a single pass
      sf.statements.forEach(stmt => {
        if (ts.isClassDeclaration(stmt) && stmt.name) {
          const name = stmt.name.text
          const entry = this.classFileIndex.get(name) || []
          entry.push({ sourceFile: sf, node: stmt })
          this.classFileIndex.set(name, entry)
        }
      })

      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && node.arguments.length > 0) {
          const callee = node.expression
          const isTransformCall =
            (ts.isIdentifier(callee) && callee.text === 'transform') ||
            (ts.isPropertyAccessExpression(callee) &&
              callee.name.text === 'transform')

          if (isTransformCall) {
            const firstArg = node.arguments[0]!
            // transform(Foo<Bar>) — the argument is an ExpressionWithTypeArguments
            // node (kind 234) whose .expression and .typeArguments are directly
            // available via the TS public API with no casts needed.
            if (
              ts.isExpressionWithTypeArguments(firstArg) &&
              firstArg.typeArguments &&
              firstArg.typeArguments.length > 0
            ) {
              const baseExpr = firstArg.expression
              // Support both `Foo<Bar>` (Identifier) and `mod.Foo<Bar>` (PropertyAccessExpression)
              const className = ts.isIdentifier(baseExpr)
                ? baseExpr.text
                : ts.isPropertyAccessExpression(baseExpr)
                  ? baseExpr.name.text
                  : undefined

              if (className) {
                const classNode = this.classFileIndex.get(className)?.[0]?.node
                if (classNode?.typeParameters) {
                  const typeMap = new Map<string, string>()
                  classNode.typeParameters.forEach((param, i) => {
                    const typeArg = firstArg.typeArguments![i]
                    if (typeArg) {
                      typeMap.set(
                        param.name.text,
                        this.getTypeNodeToString(typeArg, new Map())
                      )
                    }
                  })
                  if (typeMap.size > 0) {
                    // Key by class name — no stack trace needed at call time.
                    this.transformCallIndex.set(className, typeMap)
                  }
                }
              }
            } else {
              // Non-generic transform(Foo) call — track the class name so we
              // know the index is ambiguous when both generic and non-generic
              // call sites exist for the same class.
              const className = ts.isIdentifier(firstArg)
                ? firstArg.text
                : ts.isPropertyAccessExpression(firstArg)
                  ? firstArg.name.text
                  : undefined
              if (className) {
                this.nonGenericTransformCalls.add(className)
              }
            }
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(sf)
    })
  }

  public transform(
    cls: Function,
    sourceOptions?: {
      isExternal: boolean
      packageName: string
      filePath?: string
    }
  ): { name: string; schema: SchemaType } {
    const result = this.getSourceFileByClass(cls, sourceOptions)

    if (!result || !result?.sourceFile) {
      console.warn(`Class ${cls.name} not found in any source file.`)
      return {
        name: cls.name,
        schema: {
          type: 'object',
          required: [],
          properties: {},
          additionalProperties: true,
        },
      }
    }

    // Build the generic type map for classes with type parameters.
    //
    // Strategy: if the class has type parameters with defaults (e.g. <Entity = unknown>),
    // always use the defaults. The runtime transform(cls) call erases type args,
    // so we can't distinguish transform(Foo) from transform(Foo<Bar>) at runtime.
    // Defaults are the safe choice for the non-generic case.
    //
    // If the class has type parameters WITHOUT defaults, use the pre-computed
    // transformCallIndex (from scanning transform(Foo<Bar>) call-sites at
    // construction time) since the caller must always provide explicit type args.
    const genericTypeMap = new Map<string, string>()

    if (result.node.typeParameters) {
      const indexedTypeMap = this.transformCallIndex.get(cls.name)
      const hasNonGenericCall = this.nonGenericTransformCalls.has(cls.name)
      const allHaveDefaults = result.node.typeParameters.every(p => !!p.default)

      // When both generic and non-generic call sites exist for the same class,
      // the index is ambiguous (runtime erases type args). In that case, prefer
      // type parameter defaults so the non-generic call gets correct results.
      // The generic call site resolves via the extending subclass instead.
      if (indexedTypeMap && !(hasNonGenericCall && allHaveDefaults)) {
        // Use the pre-scanned call-site type args (from transform(Foo<Bar>))
        for (const [key, value] of indexedTypeMap) {
          genericTypeMap.set(key, value)
        }
      } else {
        // No call-site type args, or ambiguous — use type parameter defaults
        for (const param of result.node.typeParameters) {
          if (param.default) {
            genericTypeMap.set(
              param.name.text,
              this.getTypeNodeToString(param.default, new Map())
            )
          }
        }
      }
    }

    const hasGenericArgs = genericTypeMap.size > 0

    if (!hasGenericArgs && this.classCache.has(cls)) {
      return this.classCache.get(cls)!
    }

    let schema: SchemaType = { type: 'object', properties: {} }

    const properties = this.getPropertiesByClassDeclaration(
      result.node,
      undefined,
      genericTypeMap
    )

    schema = this.getSchemaFromProperties({
      properties,
      classDeclaration: result.node,
    }) as SchemaType

    if (!hasGenericArgs) {
      this.classCache.set(cls, { name: cls.name, schema })
    }

    return { name: cls.name, schema }
  }
}

export function transform<T>(
  cls: new (...args: any[]) => T,
  options?: TransformerOptions
): {
  name: string
  schema: SchemaType
} {
  // Use the singleton instance instead of creating a temporary one
  const transformer = SchemaTransformer.getInstance(undefined, options)

  return transformer.transform(cls, options?.sourceOptions)
}
