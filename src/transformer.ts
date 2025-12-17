import ts from 'typescript'
import {
  DecoratorInfo,
  Property,
  PropertyInfo,
  SchemaType,
  TransformerOptions,
} from './types'
import { constants } from './transformer.fixtures'
import { format } from 'node:path'

class SchemaTransformer {
  private static instance: SchemaTransformer | null | undefined = null

  private program: ts.Program

  private checker: ts.TypeChecker

  private classCache = new Map<string, any>()

  private readonly maxCacheSize: number

  private readonly autoCleanup: boolean

  private loadedFiles = new Set<string>()

  private processingClasses = new Set<string>()

  private sourceFiles: ts.SourceFile[]

  private classFileIndex = new Map<
    string,
    { sourceFile: ts.SourceFile; node: ts.ClassDeclaration }[]
  >()

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

    this.sourceFiles = this.program.getSourceFiles().filter(sf => {
      if (sf.isDeclarationFile) return false
      if (sf.fileName.includes('.d.ts')) return false
      if (sf.fileName.includes('node_modules')) return false
      return true
    }) as ts.SourceFile[]

    this.sourceFiles.forEach(sf => {
      sf.statements.forEach(stmt => {
        if (ts.isClassDeclaration(stmt) && stmt.name) {
          const name = stmt.name.text
          const entry = this.classFileIndex.get(name) || []
          entry.push({ sourceFile: sf, node: stmt })
          this.classFileIndex.set(name, entry)
        }
      })
    })
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
        member.name &&
        ts.isIdentifier(member.name)
      ) {
        // Skip static, private, and protected properties
        if (member.modifiers) {
          const hasExcludedModifier = member.modifiers.some(
            m =>
              m.kind === ts.SyntaxKind.StaticKeyword ||
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
          property.originalProperty.type &&
          (property.originalProperty.type as ts.NodeWithTypeArguments)
            .typeArguments?.length === 1
        ) {
          const typeArguments = (
            property.originalProperty.type as ts.NodeWithTypeArguments
          ).typeArguments

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
    return this.getStringFromType(type)
  }

  private getTypeNodeToString(
    typeNode: ts.TypeNode,
    genericTypeMap: Map<string, string> = new Map()
  ): string {
    if (
      ts.isTypeReferenceNode(typeNode) &&
      ts.isIdentifier(typeNode.typeName)
    ) {
      const typeName = typeNode.typeName.text
      if (genericTypeMap.has(typeName)) {
        return genericTypeMap.get(typeName)!
      }

      if (typeName.toLowerCase() === 'uploadfile') {
        return 'UploadFile'
      }

      if (typeNode.typeArguments && typeNode.typeArguments.length > 0) {
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
      default:
        const typeText = typeNode.getText()

        // Check if this is a generic type parameter we can resolve
        if (genericTypeMap && genericTypeMap.has(typeText)) {
          return genericTypeMap.get(typeText)!
        }

        // Handle some common TypeScript utility types
        if (typeText.startsWith('Date')) return constants.jsPrimitives.Date.type
        if (typeText.includes('Buffer') || typeText.includes('Uint8Array'))
          return constants.jsPrimitives.Buffer.type
        return typeText
    }
  }

  private resolveGenericType(typeNode: ts.TypeReferenceNode): string {
    const typeName = (typeNode.typeName as ts.Identifier).text
    const typeArguments = typeNode.typeArguments

    if (!typeArguments || typeArguments.length === 0) {
      return typeName
    }

    const type = this.checker.getTypeAtLocation(typeNode)
    const resolvedType = this.getStringFromType(type)

    if (
      resolvedType &&
      resolvedType !== typeName &&
      !resolvedType.includes('any')
    ) {
      return resolvedType
    }

    return typeName
  }

  private getStringFromType(type: ts.Type) {
    return this.checker.typeToString(type)
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
      return (arg as ts.Node).getText()
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

  private checkTypeMatch(value: any, typeNode: ts.TypeNode): boolean {
    const runtimeType = typeof value

    if (
      runtimeType === 'string' &&
      typeNode.kind === ts.SyntaxKind.StringKeyword
    )
      return true
    if (
      runtimeType === 'number' &&
      typeNode.kind === ts.SyntaxKind.NumberKeyword
    )
      return true
    if (
      runtimeType === 'boolean' &&
      typeNode.kind === ts.SyntaxKind.BooleanKeyword
    )
      return true

    if (Array.isArray(value) && ts.isArrayTypeNode(typeNode)) {
      if (value.length === 0) return true
      const firstItem = value[0]
      const elementType = typeNode.elementType
      return this.checkTypeMatch(firstItem, elementType)
    }

    if (runtimeType === 'object' && value !== null && !Array.isArray(value)) {
      if (
        ts.isTypeReferenceNode(typeNode) ||
        typeNode.kind === ts.SyntaxKind.ObjectKeyword
      ) {
        return true
      }
    }

    return false
  }

  private findBestMatch(
    cls: Function,
    matches: { sourceFile: ts.SourceFile; node: ts.ClassDeclaration }[]
  ): { sourceFile: ts.SourceFile; node: ts.ClassDeclaration } | undefined {
    const runtimeSource = cls.toString()
    const runtimeProperties = new Map<string, any>()
    const regexProperties = new Set<string>()

    // Try to extract properties from runtime source (assignments in constructor)
    try {
      const regex = /this\.([a-zA-Z0-9_$]+)\s*=/g
      let match
      while ((match = regex.exec(runtimeSource)) !== null) {
        regexProperties.add(match[1])
      }
    } catch (e) {
      // Ignore regex errors
    }

    // Try to instantiate the class to find properties
    try {
      const instance = new (cls as any)()
      Object.keys(instance).forEach(key => {
        runtimeProperties.set(key, (instance as any)[key])
      })
    } catch (e) {
      // Ignore instantiation errors (e.g. required constructor arguments)
    }

    // Try to get properties from class-validator metadata
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getMetadataStorage } = require('class-validator')
      const metadata = getMetadataStorage()
      const targetMetadata = metadata.getTargetValidationMetadatas(
        cls,
        null,
        false,
        false
      )
      targetMetadata.forEach((m: any) => {
        if (m.propertyName && !runtimeProperties.has(m.propertyName)) {
          runtimeProperties.set(m.propertyName, undefined)
        }
      })
    } catch (e) {
      // Ignore if class-validator is not available or fails
    }

    // console.log(`[findBestMatch] Class: ${cls.name}, Runtime Props: ${Array.from(runtimeProperties.keys()).join(', ')}`)

    const scores = matches.map(match => {
      let score = 0
      for (const member of match.node.members) {
        if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
          if (runtimeSource.includes(member.name.text)) {
            score += 2
          }
        } else if (
          ts.isPropertyDeclaration(member) &&
          ts.isIdentifier(member.name)
        ) {
          const propName = member.name.text
          if (runtimeProperties.has(propName)) {
            score += 1
            const value = runtimeProperties.get(propName)
            if (member.type && this.checkTypeMatch(value, member.type)) {
              score += 5
            }
          } else if (regexProperties.has(propName)) {
            score += 1
          }
        }
      }
      return { match, score }
    })

    scores.sort((a, b) => b.score - a.score)

    const firstScore = scores[0]
    const secondScore = scores[1]

    if (firstScore && firstScore.score > 0) {
      if (
        scores.length === 1 ||
        (secondScore && firstScore.score > secondScore.score)
      ) {
        return firstScore.match
      }
    }

    return undefined
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

    return this.sourceFiles.filter(sf => {
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

    if (ts.isTypeReferenceNode(typeNode)) {
      const type = this.checker.getTypeAtLocation(typeNode)
      // console.log('isEnum check:', typeNode.getText(), type.flags)
      return (
        !!(type.flags & ts.TypeFlags.Enum) ||
        !!(type.flags & ts.TypeFlags.EnumLiteral)
      )
    }

    return false
  }

  private isClassType(propertyDeclaration: ts.PropertyDeclaration): boolean {
    // If there's no explicit type annotation, we can't determine reliably
    if (!propertyDeclaration.type) {
      return false
    }

    // Check if the original property type is an array type
    if (this.isArrayProperty(propertyDeclaration)) {
      const arrayType = propertyDeclaration.type as ts.ArrayTypeNode
      const elementType = arrayType.elementType

      // Special handling for utility types with type arguments (e.g., PayloadEntity<Person>)
      if (
        ts.isTypeReferenceNode(elementType) &&
        elementType.typeArguments &&
        elementType.typeArguments.length > 0
      ) {
        // Check the first type argument - it might be the actual class
        const firstTypeArg = elementType.typeArguments[0]
        if (firstTypeArg) {
          const argType = this.checker.getTypeAtLocation(firstTypeArg)
          const argSymbol = argType.getSymbol()
          if (argSymbol && argSymbol.declarations) {
            const hasClass = argSymbol.declarations.some(decl =>
              ts.isClassDeclaration(decl)
            )
            if (hasClass) return true
          }
        }
      }

      // Get the type from the element, regardless of its syntaxkind
      const type = this.checker.getTypeAtLocation(elementType)
      const symbol = type.getSymbol()

      if (symbol && symbol.declarations) {
        return symbol.declarations.some(decl => ts.isClassDeclaration(decl))
      }

      return false
    }
    // Check non-array types
    else {
      // Special handling for utility types with type arguments (e.g., PayloadEntity<Branch>)
      if (
        ts.isTypeReferenceNode(propertyDeclaration.type) &&
        propertyDeclaration.type.typeArguments &&
        propertyDeclaration.type.typeArguments.length > 0
      ) {
        // Check the first type argument - it might be the actual class
        const firstTypeArg = propertyDeclaration.type.typeArguments[0]
        if (firstTypeArg) {
          const argType = this.checker.getTypeAtLocation(firstTypeArg)
          const argSymbol = argType.getSymbol()
          if (argSymbol && argSymbol.declarations) {
            const hasClass = argSymbol.declarations.some(decl =>
              ts.isClassDeclaration(decl)
            )
            if (hasClass) return true
          }
        }
      }

      const type = this.checker.getTypeAtLocation(propertyDeclaration.type)
      const symbol = type.getSymbol()

      if (symbol && symbol.declarations) {
        return symbol.declarations.some(decl => ts.isClassDeclaration(decl))
      }

      return false
    }
  }

  private getDeclarationProperty(
    property: PropertyInfo
  ): ts.Declaration | undefined {
    if (!property.originalProperty.type) {
      return undefined
    }

    // Handle array types - get the element type
    if (ts.isArrayTypeNode(property.originalProperty.type)) {
      const elementType = property.originalProperty.type.elementType

      // Check if it's a utility type with type arguments (e.g., PayloadEntity<Branch>[])
      if (
        ts.isTypeReferenceNode(elementType) &&
        elementType.typeArguments &&
        elementType.typeArguments.length > 0
      ) {
        const firstTypeArg = elementType.typeArguments[0]
        if (firstTypeArg) {
          const argType = this.checker.getTypeAtLocation(firstTypeArg)
          const argSymbol = argType.getSymbol()
          if (argSymbol && argSymbol.declarations) {
            const classDecl = argSymbol.declarations.find(decl =>
              ts.isClassDeclaration(decl)
            )
            if (classDecl) return classDecl
          }
        }
      }

      const type = this.checker.getTypeAtLocation(elementType)
      const symbol = type.getSymbol()

      if (symbol && symbol.declarations) {
        // Return the first class declaration found
        const classDecl = symbol.declarations.find(decl =>
          ts.isClassDeclaration(decl)
        )
        return classDecl || symbol.declarations[0]
      }

      return undefined
    }

    // Handle non-array types
    // Check if it's a utility type with type arguments (e.g., PayloadEntity<Branch>)
    if (
      ts.isTypeReferenceNode(property.originalProperty.type) &&
      property.originalProperty.type.typeArguments &&
      property.originalProperty.type.typeArguments.length > 0
    ) {
      const firstTypeArg = property.originalProperty.type.typeArguments[0]
      if (firstTypeArg) {
        const argType = this.checker.getTypeAtLocation(firstTypeArg)
        const argSymbol = argType.getSymbol()
        if (argSymbol && argSymbol.declarations) {
          const classDecl = argSymbol.declarations.find(decl =>
            ts.isClassDeclaration(decl)
          )
          if (classDecl) return classDecl
        }
      }
    }

    const type = this.checker.getTypeAtLocation(property.originalProperty.type)
    const symbol = type.getSymbol()

    if (symbol && symbol.declarations) {
      // Return the first class declaration found
      const classDecl = symbol.declarations.find(decl =>
        ts.isClassDeclaration(decl)
      )
      return classDecl || symbol.declarations[0]
    }

    return undefined
  }

  private isArrayProperty(
    propertyDeclaration: ts.PropertyDeclaration
  ): boolean {
    if (!propertyDeclaration.type) {
      return false
    }

    return ts.isArrayTypeNode(propertyDeclaration.type)
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
    } else {
      schema = { type: 'object', properties: {}, additionalProperties: true }
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
    const propertyType = property.type.toLowerCase().replace('[]', '').trim()
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
        propertySchema.type = constants.jsPrimitives.Object.value
        break
      default:
        propertySchema.type = constants.jsPrimitives.String.value
    }

    if (property.isArray) {
      delete propertySchema.format
      propertySchema.type = `array`
      propertySchema.items = {
        type: isFile ? constants.jsPrimitives.UploadFile.value : propertyType,
        format: isFile
          ? constants.jsPrimitives.UploadFile.format
          : propertySchema.format,
      }
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
      const type = this.checker.getTypeAtLocation(arg as ts.Node)

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
        }
      }
    }
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
          } else if (schema.items) {
            this.applyEnumDecorator(decorator, schema.items)
          }
          break
      }
    }
  }

  public transform(
    cls: Function,
    sourceOptions?: {
      isExternal: boolean
      packageName: string
      filePath?: string
    }
  ): { name: string; schema: SchemaType } {
    let schema: SchemaType = { type: 'object', properties: {} }

    const result = this.getSourceFileByClass(cls, sourceOptions)

    if (!result?.sourceFile) {
      console.warn(`Class ${cls.name} not found in any source file.`)
      return { name: cls.name, schema: {} as SchemaType }
    }

    const properties = this.getPropertiesByClassDeclaration(result.node)

    schema = this.getSchemaFromProperties({
      properties,
      classDeclaration: result.node,
    }) as SchemaType

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
