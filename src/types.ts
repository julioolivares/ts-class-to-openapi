import ts from 'typescript'
type Property = ({ [key: string]: any } & { type: string }) | SchemaType

// Support for both regular schemas and $ref schemas (OpenAPI 3.1)
type SchemaType =
  | ({ [key: string]: any } & {
      properties: { [key: string]: any } & { additionalProperties?: boolean }
    } & { required?: string[] } & { type: string })
  | ({ [key: string]: any } & {
      $ref: string
    })
  | ({ [key: string]: any } & { type: 'array' } & { items: SchemaType })

/**
 * Information about a class-validator decorator found on a property.
 * @interface DecoratorInfo
 */
interface DecoratorInfo {
  /** The name of the decorator (e.g., "IsString", "MinLength") */
  name: string
  /** Arguments passed to the decorator */
  arguments: any[]
}

/**
 * Information about a class property including its type and decorators.
 * @interface PropertyInfo
 */
interface PropertyInfo {
  /** The name of the property */
  name: string
  /** The TypeScript type of the property as a string */
  type: string
  /** Array of decorators applied to this property */
  decorators: DecoratorInfo[]
  /** Whether the property is optional (has ? operator) */
  isOptional: boolean
  /** Whether the property type is a generic type */
  isGeneric: boolean

  /** Whether the property type is a primitive type */
  isPrimitive: boolean

  /** Whether the property type is a class type */
  isClassType?: boolean

  /** Whether the property type is an array type */
  isArray?: boolean

  /** The original TypeScript property declaration (optional) */
  originalProperty: ts.PropertyDeclaration

  /** Whether the property is a reference to another or yourselves schema */
  isRef?: boolean
}

/**
 * Configuration options for SchemaTransformer memory management
 * @interface TransformerOptions
 */
interface TransformerOptions {
  /** Maximum number of schemas to cache before cleanup (default: 100) */
  maxCacheSize?: number
  /** Whether to automatically clean up cache (default: true) */
  autoCleanup?: boolean

  /** Options related to the source of the class being transformed */
  sourceOptions?:
    | {
        /** Whether the class is from an external module */
        isExternal: true
        /** The package name (required when isExternal is true) */
        packageName: string
        /** The file path of the class being transformed */
        filePath?: string
      }
    | {
        /** Whether the class is from an external module */
        isExternal: false
        /** The package name (optional when isExternal is false) */
        packageName: never
        /** The file path of the class being transformed */
        filePath?: string
      }
}

export {
  type SchemaType,
  type Property,
  type DecoratorInfo,
  type PropertyInfo,
  type TransformerOptions,
}
