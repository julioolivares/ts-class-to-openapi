/**
 * Test cases for edge cases and error handling
 */
import { test, describe } from 'node:test'
import assert from 'node:assert'
import { transform } from '../../index.js'

describe('Edge Cases and Error Handling', () => {
  test('should handle empty class', () => {
    class EmptyClass {}

    const result = transform(EmptyClass)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)
    assert.strictEqual(Object.keys(schema.properties).length, 0)
  })

  test('should handle class with only static properties', () => {
    class StaticOnlyClass {
      static staticProp: string = 'test'
      static anotherStatic: number = 42
    }

    const result = transform(StaticOnlyClass)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)
    // Static properties should not be included in the schema
    assert.strictEqual(Object.keys(schema.properties).length, 0)
  })

  test('should handle class with methods', () => {
    class ClassWithMethods {
      name: string

      getName(): string {
        return this.name
      }

      setName(name: string): void {
        this.name = name
      }
    }

    const result = transform(ClassWithMethods)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)
    // Only properties should be included, not methods
    assert.strictEqual(Object.keys(schema.properties).length, 1)
    assert.ok(schema.properties.name)
    assert.strictEqual(schema.properties.name.type, 'string')
  })

  test('should handle class with getters and setters', () => {
    class ClassWithAccessors {
      private _value: number = 0

      get value(): number {
        return this._value
      }

      set value(val: number) {
        this._value = val
      }

      name: string
    }

    const result = transform(ClassWithAccessors)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)
    // Should include the name property and the getter
    assert.ok(schema.properties.name)
    assert.ok(schema.properties.value)
  })

  test('should preserve property names correctly', () => {
    class PropertyNamesTest {
      camelCase: string
      snake_case: string
      PascalCase: string
      'kebab-case': string
      $specialChar: string
    }

    const result = transform(PropertyNamesTest)
    const schema = result.schema

    const propertyNames = Object.keys(schema.properties)
    assert.ok(propertyNames.includes('camelCase'))
    assert.ok(propertyNames.includes('snake_case'))
    assert.ok(propertyNames.includes('PascalCase'))
    assert.ok(propertyNames.includes('kebab-case'))
    assert.ok(propertyNames.includes('$specialChar'))
  })

  test('should handle class with complex union types', () => {
    class ComplexUnionClass {
      stringOrNumberOrBoolean: string | number | boolean
      arrayOrObject: string[] | { key: string }
      optionalUnion?: Date | string | null
    }

    const result = transform(ComplexUnionClass)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    // Union types should be handled appropriately
    assert.ok(schema.properties.stringOrNumberOrBoolean)
    assert.ok(schema.properties.arrayOrObject)
    assert.ok(schema.properties.optionalUnion)
  })

  test('should handle class with readonly properties', () => {
    class ReadonlyClass {
      readonly id: number
      readonly createdAt: Date
      name: string
    }

    const result = transform(ReadonlyClass)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    // Readonly properties should still be included
    assert.ok(schema.properties.id)
    assert.ok(schema.properties.createdAt)
    assert.ok(schema.properties.name)

    assert.strictEqual(schema.properties.id.type, 'integer')
    assert.strictEqual(schema.properties.createdAt.type, 'string')
    assert.strictEqual(schema.properties.createdAt.format, 'date-time')
    assert.strictEqual(schema.properties.name.type, 'string')
  })

  test('should handle class with private and protected properties', () => {
    class AccessModifierClass {
      public publicProp: string
      private privateProp: number
      protected protectedProp: boolean
    }

    const result = transform(AccessModifierClass)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    // All properties should be included regardless of access modifier
    assert.ok(schema.properties.publicProp)
    assert.ok(schema.properties.privateProp)
    assert.ok(schema.properties.protectedProp)
  })
})
