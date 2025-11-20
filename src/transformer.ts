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
  }

  private getPropertiesByClassDeclaration(
    classNode: ts.ClassDeclaration,
    visitedDeclarations: Set<ts.ClassDeclaration> = new Set<ts.ClassDeclaration>()
  ): PropertyInfo[] {
    if (visitedDeclarations.has(classNode)) {
      return [] as PropertyInfo[]
    }

    visitedDeclarations.add(classNode)

    // if no heritage clauses, get properties directly from class
    if (!classNode.heritageClauses) {
      return this.getPropertiesByClassMembers(classNode.members, classNode)
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
          baseProperties = this.getPropertiesByClassDeclaration(
            declaration,
            visitedDeclarations
          )
        }

        properties = this.getPropertiesByClassMembers(
          classNode.members,
          classNode
        )

        return baseProperties.concat(properties)
      } else {
        return this.getPropertiesByClassMembers(classNode.members, classNode)
      }
    }
  }

  private getPropertiesByClassMembers(
    members: ts.NodeArray<ts.ClassElement>,
    parentClassNode?: ts.ClassDeclaration
  ) {
    const properties: PropertyInfo[] = []

    for (const member of members) {
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

  private getPropertyType(property: ts.PropertyDeclaration): string {
    if (property.type) {
      return this.getTypeNodeToString(property.type)
    }

    const type = this.checker.getTypeAtLocation(property)
    return this.getStringFromType(type)
  }

  private getTypeNodeToString(typeNode: ts.TypeNode): string {
    if (
      ts.isTypeReferenceNode(typeNode) &&
      ts.isIdentifier(typeNode.typeName)
    ) {
      if (typeNode.typeName.text.toLowerCase() === 'uploadfile') {
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
      return arg.getText()
    })
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

  private getSourceFileByClassName(
    className: string,
    sourceOptions?: {
      isExternal: boolean
      packageName: string
      filePath?: string
    }
  ): { sourceFile: ts.SourceFile; node: ts.ClassDeclaration } | undefined {
    let sourceFiles: ts.SourceFile[] = []

    if (sourceOptions?.isExternal) {
      sourceFiles = this.program.getSourceFiles().filter(sf => {
        return (
          sf.fileName.includes(sourceOptions.packageName) &&
          (!sourceOptions.filePath || sf.fileName === sourceOptions.filePath)
        )
      })
    } else {
      sourceFiles = this.program.getSourceFiles().filter(sf => {
        if (sf.isDeclarationFile) return false
        if (sf.fileName.includes('.d.ts')) return false
        if (sf.fileName.includes('node_modules')) return false

        return true
      })
    }

    for (const sourceFile of sourceFiles) {
      let node: ts.ClassDeclaration | undefined

      const found = sourceFile.statements.some(stmt => {
        node = stmt as ts.ClassDeclaration

        return (
          ts.isClassDeclaration(stmt) &&
          stmt.name &&
          stmt.name.text === className
        )
      })

      if (found) {
        return { sourceFile, node: node as ts.ClassDeclaration }
      }
    }
  }

  private isClassType(propertyDeclaration: ts.PropertyDeclaration): boolean {
    // If there's no explicit type annotation, we can't determine reliably
    if (!propertyDeclaration.type) {
      return false
    }

    // Check if the original property type is an array type
    if (
      this.isArrayProperty(propertyDeclaration) &&
      ts.isTypeReferenceNode(
        (propertyDeclaration.type as ts.ArrayTypeNode)
          .elementType as ts.TypeReferenceNode
      )
    ) {
      const type = this.checker.getTypeAtLocation(
        (propertyDeclaration.type as ts.ArrayTypeNode).elementType
      )

      const symbol = type.getSymbol()

      if (symbol && symbol.declarations) {
        return symbol.declarations.some(decl => ts.isClassDeclaration(decl))
      }
    } else if (ts.isTypeReferenceNode(propertyDeclaration.type)) {
      const type = this.checker.getTypeAtLocation(propertyDeclaration.type)

      const symbol = type.getSymbol()

      if (symbol && symbol.declarations) {
        return symbol.declarations.some(decl => ts.isClassDeclaration(decl))
      }
    }

    return false
  }

  private getDeclarationProperty(
    property: PropertyInfo
  ): ts.Declaration | undefined {
    if (!property.originalProperty.type) {
      return undefined
    }

    if (
      ts.isArrayTypeNode(property.originalProperty.type) &&
      ts.isTypeReferenceNode(property.originalProperty.type.elementType)
    ) {
      const type = this.checker.getTypeAtLocation(
        property.originalProperty.type.elementType
      )

      const symbol = type.getSymbol()

      if (symbol && symbol.declarations) {
        return symbol.declarations[0]
      }
    } else if (ts.isTypeReferenceNode(property.originalProperty.type)) {
      const type = this.checker.getTypeAtLocation(
        property.originalProperty.type
      )

      const symbol = type.getSymbol()

      if (symbol && symbol.declarations) {
        return symbol.declarations[0]
      }
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

    return schema
  }

  private getSchemaFromPrimitive(property: PropertyInfo): Property {
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

  //Todo: implement properly
  private applyEnumDecorator(
    decorator: DecoratorInfo,
    schema: SchemaType
  ): void {}

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
          schema.minLength = decorator.arguments[0]
          break
        case constants.validatorDecorators.MaxLength.name:
          schema.maxLength = decorator.arguments[0]
          break
        case constants.validatorDecorators.Length.name:
          schema.minLength = decorator.arguments[0]
          if (decorator.arguments[1]) {
            schema.maxLength = decorator.arguments[1]
          }
          break
        case constants.validatorDecorators.Min.name:
          schema.minimum = decorator.arguments[0]
          break
        case constants.validatorDecorators.Max.name:
          schema.maximum = decorator.arguments[0]
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
          schema.minItems = decorator.arguments[0]
          break
        case constants.validatorDecorators.ArrayMaxSize.name:
          schema.maxItems = decorator.arguments[0]
          break
        case constants.validatorDecorators.IsEnum.name:
          this.applyEnumDecorator(decorator, schema)
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

    const result = this.getSourceFileByClassName(cls.name, sourceOptions)

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
