import { test, describe } from 'node:test'
import assert from 'node:assert'
import { transform } from '../../index.js'
import {
  EnumTestEntity,
  ArrayEnumTestEntity,
  PureEnumTestEntity,
  UserRole,
  OrderStatus,
  MixedEnum,
} from '../entities/enum-classes.js'

describe('Enum Properties Transformation', () => {
  test('should transform string enums correctly', () => {
    const result = transform(EnumTestEntity)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    const roleProp = schema.properties.role
    assert.strictEqual(roleProp.type, 'string')
    assert.deepStrictEqual(roleProp.enum, ['admin', 'user', 'guest'])
  })

  test('should transform numeric enums correctly', () => {
    const result = transform(EnumTestEntity)
    const schema = result.schema

    const statusProp = schema.properties.status
    assert.strictEqual(statusProp.type, 'number')
    assert.deepStrictEqual(statusProp.enum, [0, 1, 2, 3, 4])
  })

  test('should transform mixed enums correctly', () => {
    const result = transform(EnumTestEntity)
    const schema = result.schema

    const mixedProp = schema.properties.mixed
    // Mixed enums usually default to string or the first type found,
    // but my implementation checks: if all string -> string, if all number -> number, else string.
    // 'yes' is string, 0 is number. So it should be 'string'.
    assert.strictEqual(mixedProp.type, 'string')
    assert.deepStrictEqual(mixedProp.enum, ['yes', 0])
    assert.strictEqual(schema.required?.includes('mixed'), false)
  })

  test('should transform array of enums correctly', () => {
    const result = transform(ArrayEnumTestEntity)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')

    const rolesProp = schema.properties.roles
    assert.strictEqual(rolesProp.type, 'array')
    assert.strictEqual(rolesProp.items.type, 'string')
    assert.deepStrictEqual(rolesProp.items.enum, ['admin', 'user', 'guest'])

    const statusesProp = schema.properties.statuses
    assert.strictEqual(statusesProp.type, 'array')
    assert.strictEqual(statusesProp.items.type, 'number')
    assert.deepStrictEqual(statusesProp.items.enum, [0, 1, 2, 3, 4])
  })

  test('should transform pure enums correctly without decorators', () => {
    const result = transform(PureEnumTestEntity)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    const roleProp = schema.properties.role
    assert.strictEqual(roleProp.type, 'string')
    assert.deepStrictEqual(roleProp.enum, ['admin', 'user', 'guest'])

    const statusProp = schema.properties.status
    assert.strictEqual(statusProp.type, 'number')
    assert.deepStrictEqual(statusProp.enum, [0, 1, 2, 3, 4])

    const mixedProp = schema.properties.mixed
    assert.strictEqual(mixedProp.type, 'string')
    assert.deepStrictEqual(mixedProp.enum, ['yes', 0])
  })
})
