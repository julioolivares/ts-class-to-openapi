/**
 * Test cases for validating the generated schema structure
 */
import { test, describe } from 'node:test'
import assert from 'node:assert'
import { transform } from '../../index.js'
import {
  TypeMappingTest,
  NestedSchema,
  CircularA,
  CircularB,
  RequiredFieldsTest,
} from '../entities/schema-validation-classes.js'
import { PureUser, SimplePerson } from '../entities/pure-classes.js'
import { NestedUser } from '../entities/nested-classes.js'
import { DecoratedUser } from '../entities/decorated-classes.js'

describe('Schema Output Validation', () => {
  test('generated schemas should be valid OpenAPI 3.1.0 objects', () => {
    const testClasses: Array<new (...args: any[]) => any> = [
      PureUser,
      SimplePerson,
      NestedUser,
      DecoratedUser,
    ]

    testClasses.forEach(TestClass => {
      const result = transform(TestClass)
      const schema = result.schema

      // Basic OpenAPI schema structure
      assert.ok(schema.type)
      assert.ok(schema.properties)

      // Properties should be objects with type information
      Object.values(schema.properties).forEach(property => {
        assert.ok(typeof property === 'object')
        assert.ok(property !== null)
        // Property should have type, $ref, or enum
        const prop = property as any
        assert.ok(prop.type || prop.$ref || prop.enum)
      })

      // Required should be an array if present
      if (schema.required) {
        assert.ok(Array.isArray(schema.required))
      }
    })
  })

  test('should return correct class name in result', () => {
    const result = transform(PureUser)
    assert.strictEqual(result.name, 'PureUser')

    const result2 = transform(NestedUser)
    assert.strictEqual(result2.name, 'NestedUser')

    const result3 = transform(DecoratedUser)
    assert.strictEqual(result3.name, 'DecoratedUser')
  })

  test('schema properties should have consistent type mappings', () => {
    class TypeMappingTest {
      stringProp: string
      numberProp: number
      integerProp: number // Should be mapped as number in JSON Schema
      booleanProp: boolean
      dateProp: Date
      arrayProp: string[]
      objectProp: { key: string }
    }

    const result = transform(TypeMappingTest)
    const schema = result.schema

    assert.strictEqual(schema.properties.stringProp.type, 'string')
    assert.strictEqual(schema.properties.numberProp.type, 'number')
    assert.strictEqual(schema.properties.integerProp.type, 'number')
    assert.strictEqual(schema.properties.booleanProp.type, 'boolean')
    assert.strictEqual(schema.properties.dateProp.type, 'string')
    assert.strictEqual(schema.properties.dateProp.format, 'date-time')
    assert.strictEqual(schema.properties.arrayProp.type, 'array')
    assert.strictEqual(schema.properties.arrayProp.items.type, 'string')
    assert.strictEqual(schema.properties.objectProp.type, 'object')
  })

  test('should handle nested schemas correctly', () => {
    class NestedSchema {
      nested: {
        level1: {
          level2: string
          array: number[]
        }
        simple: boolean
      }
    }

    const result = transform(NestedSchema)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties.nested)
    assert.strictEqual(schema.properties.nested.type, 'object')

    // Check nested properties
    const nestedProps = schema.properties.nested.properties
    assert.ok(nestedProps.level1)
    assert.strictEqual(nestedProps.level1.type, 'object')
    assert.ok(nestedProps.simple)
    assert.strictEqual(nestedProps.simple.type, 'boolean')
  })

  test('should maintain schema consistency across multiple transforms', () => {
    // Transform the same class multiple times
    const result1 = transform(PureUser)
    const result2 = transform(PureUser)
    const result3 = transform(PureUser)

    // All results should be identical
    assert.deepStrictEqual(result1, result2)
    assert.deepStrictEqual(result2, result3)
    assert.deepStrictEqual(result1, result3)
  })

  test('should handle circular references gracefully', () => {
    class CircularA {
      name: string
      b?: CircularB
    }

    class CircularB {
      value: number
      a?: CircularA
    }

    // This should not throw an error or cause infinite loops
    const resultA = transform(CircularA)
    const resultB = transform(CircularB)

    assert.strictEqual(resultA.schema.type, 'object')
    assert.strictEqual(resultB.schema.type, 'object')
    assert.ok(resultA.schema.properties)
    assert.ok(resultB.schema.properties)
  })

  test('should include all non-optional properties in required array', () => {
    class RequiredFieldsTest {
      required1: string
      required2: number
      optional1?: boolean
      optional2?: Date
      required3: string[]
    }

    const result = transform(RequiredFieldsTest)
    const schema = result.schema

    const required = schema.required || []
    assert.ok(required.includes('required1'))
    assert.ok(required.includes('required2'))
    assert.ok(required.includes('required3'))
    assert.ok(!required.includes('optional1'))
    assert.ok(!required.includes('optional2'))
  })
})
