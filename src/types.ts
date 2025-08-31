type Property = { [key: string]: any } & { type: string }

// Support for both regular schemas and $ref schemas (OpenAPI 3.1)
type SchemaType =
  | ({ [key: string]: any } & {
      properties: { [key: string]: any }
    } & { required: string[] } & { type: string })
  | ({ [key: string]: any } & {
      $ref: string
    })

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
}

export { type SchemaType, type Property, type DecoratorInfo, type PropertyInfo }
