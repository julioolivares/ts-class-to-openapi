import ts from 'typescript'
type Property = { [key: string]: any } & { type: string }

// Support for both regular schemas and $ref schemas (OpenAPI 3.1)
type SchemaType =
  | ({ [key: string]: any } & {
      properties: { [key: string]: any }
    } & { required: string[] } & { type: string })
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

  /** The original TypeScript property declaration (optional) */
  originalProperty: ts.Node
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
}

export {
  type SchemaType,
  type Property,
  type DecoratorInfo,
  type PropertyInfo,
  type TransformerOptions,
}
