/**
 * Test cases for pure TypeScript classes (without decorators)
 */
import { test, describe } from 'node:test'
import assert from 'node:assert'
import { transform } from '../../index.js'
import { PureUser, SimplePerson, Product } from '../entities/pure-classes.js'
import {
  OptionalOnlyClass,
  UnionTypeClass,
} from '../entities/additional-test-classes.js'

describe('Pure TypeScript Classes', () => {
  test('should transform PureUser class correctly', () => {
    const result = transform(PureUser)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    // Check basic properties
    assert.strictEqual(schema.properties.id.type, 'number')
    assert.strictEqual(schema.properties.name.type, 'string')
    assert.strictEqual(schema.properties.email.type, 'string')
    assert.strictEqual(schema.properties.age.type, 'number')
    assert.strictEqual(schema.properties.isActive.type, 'boolean')

    // Check array properties
    assert.strictEqual(schema.properties.tags.type, 'array')
    assert.strictEqual(schema.properties.tags.items.type, 'string')

    // Check required fields (all non-optional fields should be required)
    const expectedRequired = [
      'id',
      'name',
      'email',
      'age',
      'isActive',
      'tags',
      'metadata',
      'createdAt',
    ]
    assert.deepStrictEqual(schema.required?.sort(), expectedRequired.sort())
  })

  test('should transform SimplePerson class correctly', () => {
    const result = transform(SimplePerson)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    assert.strictEqual(schema.properties.firstName.type, 'string')
    assert.strictEqual(schema.properties.lastName.type, 'string')
    assert.strictEqual(schema.properties.age.type, 'number')
    assert.strictEqual(schema.properties.isEmployed.type, 'boolean')

    assert.deepStrictEqual(
      schema.required?.sort(),
      ['firstName', 'lastName', 'age', 'isEmployed'].sort()
    )
  })

  test('should transform Product class correctly', () => {
    const result = transform(Product)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    // Check basic properties
    assert.strictEqual(schema.properties.id.type, 'number')
    assert.strictEqual(schema.properties.name.type, 'string')
    assert.strictEqual(schema.properties.price.type, 'number')
    assert.strictEqual(schema.properties.isAvailable.type, 'boolean')

    // Check array property
    assert.strictEqual(schema.properties.categories.type, 'array')
    assert.strictEqual(schema.properties.categories.items.type, 'string')
    assert.strictEqual(schema.properties.scores.type, 'array')
    assert.strictEqual(schema.properties.scores.items.type, 'number')

    // Check optional fields are not in required
    const requiredFields = schema.required || []
    assert.ok(!requiredFields.includes('description'))
  })

  test('should handle class with only optional properties', () => {
    const result = transform(OptionalOnlyClass)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)
    assert.strictEqual(schema.properties.optionalProp.type, 'string')
    assert.strictEqual(schema.properties.anotherOptional.type, 'number')

    // Should have no required fields
    assert.ok(!schema.required || schema.required.length === 0)
  })

  test('should handle union types', () => {
    const result = transform(UnionTypeClass)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    // Union types should be handled appropriately
    assert.ok(schema.properties.stringOrNumber)
    assert.ok(schema.properties.optionalUnion)
  })
})
