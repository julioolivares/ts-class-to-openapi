import { test, describe } from 'node:test'
import assert from 'node:assert'
import { transform } from '../../src/index.js'
import {
  IsInStringEntity,
  IsInNumberEntity,
  IsInMixedEntity,
  IsInArrayEntity,
  IsNotInEntity,
  IsNotInArrayEntity,
} from '../entities/enum-classes.js'

describe('@IsIn decorator', () => {
  test('should add enum with string values to schema', () => {
    const result = transform(IsInStringEntity)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)
    assert.deepStrictEqual(schema.properties.role.enum, [
      'admin',
      'editor',
      'viewer',
    ])
  })

  test('should add enum with number values to schema', () => {
    const result = transform(IsInNumberEntity)
    const schema = result.schema

    assert.deepStrictEqual(schema.properties.priority.enum, [1, 2, 3])
  })

  test('should add enum with mixed values to schema', () => {
    const result = transform(IsInMixedEntity)
    const schema = result.schema

    assert.deepStrictEqual(schema.properties.status.enum, ['active', 0])
  })

  test('should place enum on items when property is an array', () => {
    const result = transform(IsInArrayEntity)
    const schema = result.schema

    const rolesProp = schema.properties.roles
    assert.strictEqual(rolesProp.type, 'array')
    assert.deepStrictEqual(rolesProp.items.enum, ['admin', 'editor', 'viewer'])
  })
})

describe('@IsNotIn decorator', () => {
  test('should add not.enum with excluded values to schema', () => {
    const result = transform(IsNotInEntity)
    const schema = result.schema

    assert.ok(schema.properties)
    assert.deepStrictEqual(schema.properties.role.not, {
      enum: ['banned', 'suspended'],
    })
  })

  test('should place not.enum on items when property is an array', () => {
    const result = transform(IsNotInArrayEntity)
    const schema = result.schema

    const rolesProp = schema.properties.roles
    assert.strictEqual(rolesProp.type, 'array')
    assert.deepStrictEqual(rolesProp.items.not, {
      enum: ['banned', 'suspended'],
    })
  })
})
