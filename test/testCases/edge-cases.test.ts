/**
 * Test cases for edge cases and error handling
 */
import { test, describe } from 'node:test'
import assert from 'node:assert'
import { transform } from '../../src'
import {
  EmptyClass,
  StaticOnlyClass,
  ClassWithMethods,
  ClassWithAccessors,
  PropertyNamesTest,
  ComplexUnionClass,
  ReadonlyClass,
  AccessModifierClass,
} from '../entities/edge-case-classes'

describe('Edge Cases and Error Handling', () => {
  test('should handle empty class', () => {
    const result = transform(EmptyClass)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)
    assert.strictEqual(Object.keys(schema.properties).length, 0)
  })

  test('should handle class with only static properties', () => {
    const result = transform(StaticOnlyClass)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)
    // Static properties should  be included in the schema
    assert.strictEqual(Object.keys(schema.properties).length, 2)
  })

  test('should handle class with methods', () => {
    const result = transform(ClassWithMethods)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)
    // Only properties should be included, not methods
    assert.strictEqual(Object.keys(schema.properties).length, 1)
    assert.ok(schema.properties.name)
    assert.strictEqual(schema.properties.name.type, 'string')
  })

  test('should preserve property names correctly', () => {
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
    const result = transform(ReadonlyClass)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    // Readonly properties should still be included
    assert.ok(schema.properties.id)
    assert.ok(schema.properties.createdAt)
    assert.ok(schema.properties.name)

    assert.strictEqual(schema.properties.id.format, 'integer')
    assert.strictEqual(schema.properties.id.type, 'number')
    assert.strictEqual(schema.properties.createdAt.type, 'string')
    assert.strictEqual(schema.properties.createdAt.format, 'date-time')
    assert.strictEqual(schema.properties.name.type, 'string')
  })

  test('should handle class with private and protected properties', () => {
    const result = transform(AccessModifierClass)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    // All properties should be included regardless of access modifier
    assert.ok(schema.properties.publicProp)
    assert.ok(schema.properties.privateProp === undefined)
    assert.ok(schema.properties.protectedProp === undefined)
  })
})
