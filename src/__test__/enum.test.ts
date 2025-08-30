import { test, describe } from 'node:test'
import assert from 'node:assert'
import { transform } from '../transformer.js'
import {
  EnumTestEntity,
  UserRole,
  Priority,
  Status,
  BooleanEnum,
} from './entities/enum.entity.js'
import {
  ComprehensiveEnumEntity,
  Color,
  Size,
  HttpStatus,
} from './entities/comprehensive-enum.entity.js'

describe('Enum Decorator Support', () => {
  test('should handle string enum with @IsEnum decorator', () => {
    const result = transform(EnumTestEntity)

    assert.strictEqual(result.name, 'EnumTestEntity')
    assert.strictEqual(result.schema.type, 'object')

    // Check string enum (UserRole)
    const roleProperty = result.schema.properties.role
    assert.strictEqual(roleProperty.type, 'string')
    assert.ok(roleProperty.enum)
    assert.deepStrictEqual(roleProperty.enum, ['admin', 'user', 'moderator'])
    assert.ok(result.schema.required.includes('role'))
  })

  test('should handle numeric enum with @IsEnum decorator', () => {
    const result = transform(EnumTestEntity)

    // Check numeric enum (Priority)
    const priorityProperty = result.schema.properties.priority
    assert.strictEqual(priorityProperty.type, 'number')
    assert.ok(priorityProperty.enum)
    assert.deepStrictEqual(priorityProperty.enum, [1, 2, 3])
  })

  test('should handle object enum with @IsEnum decorator', () => {
    const result = transform(EnumTestEntity)

    // Check object enum (Status)
    const statusProperty = result.schema.properties.status
    assert.strictEqual(statusProperty.type, 'string')
    assert.ok(statusProperty.enum)
    assert.deepStrictEqual(statusProperty.enum, [
      'active',
      'inactive',
      'pending',
    ])
  })

  test('should handle boolean-like enum with @IsEnum decorator', () => {
    const result = transform(EnumTestEntity)

    // Check boolean-like enum (BooleanEnum)
    const flagProperty = result.schema.properties.flag
    assert.strictEqual(flagProperty.type, 'string')
    assert.ok(flagProperty.enum)
    assert.deepStrictEqual(flagProperty.enum, ['true', 'false'])
  })

  test('should handle array of enum values', () => {
    const result = transform(EnumTestEntity)

    // Check array of string enums
    const rolesProperty = result.schema.properties.roles
    assert.strictEqual(rolesProperty.type, 'array')
    assert.ok(rolesProperty.items)
    assert.strictEqual(rolesProperty.items.type, 'string')
    assert.ok(rolesProperty.items.enum)
    assert.deepStrictEqual(rolesProperty.items.enum, [
      'admin',
      'user',
      'moderator',
    ])

    // Check array of numeric enums
    const prioritiesProperty = result.schema.properties.priorities
    assert.strictEqual(prioritiesProperty.type, 'array')
    assert.ok(prioritiesProperty.items)
    assert.strictEqual(prioritiesProperty.items.type, 'number')
    assert.ok(prioritiesProperty.items.enum)
    assert.deepStrictEqual(prioritiesProperty.items.enum, [1, 2, 3])
  })

  test('should handle optional enum properties', () => {
    const result = transform(EnumTestEntity)

    // Check optional enum property
    const optionalRoleProperty = result.schema.properties.optionalRole
    assert.strictEqual(optionalRoleProperty.type, 'string')
    assert.ok(optionalRoleProperty.enum)
    assert.deepStrictEqual(optionalRoleProperty.enum, [
      'admin',
      'user',
      'moderator',
    ])
    assert.ok(!result.schema.required.includes('optionalRole'))
  })

  test('should correctly identify required vs optional enum properties', () => {
    const result = transform(EnumTestEntity)

    // Required properties should include role (has @IsNotEmpty)
    assert.ok(result.schema.required.includes('role'))

    // Optional properties (with ?) should not be in required array
    assert.ok(!result.schema.required.includes('optionalRole'))
    assert.ok(!result.schema.required.includes('priority'))
    assert.ok(!result.schema.required.includes('status'))
    assert.ok(!result.schema.required.includes('flag'))
    assert.ok(!result.schema.required.includes('roles'))
    assert.ok(!result.schema.required.includes('priorities'))
  })

  test('should handle comprehensive enum scenarios', () => {
    const result = transform(ComprehensiveEnumEntity)

    // String enum
    const primaryColorProperty = result.schema.properties.primaryColor
    assert.strictEqual(primaryColorProperty.type, 'string')
    assert.deepStrictEqual(primaryColorProperty.enum, ['red', 'green', 'blue'])

    // Auto-incremented numeric enum
    const sizeProperty = result.schema.properties.size
    assert.strictEqual(sizeProperty.type, 'number')
    assert.deepStrictEqual(sizeProperty.enum, [0, 1, 2])

    // Mixed enum (should pick first type - number in this case)
    const statusProperty = result.schema.properties.status
    assert.strictEqual(statusProperty.type, 'number')
    assert.deepStrictEqual(statusProperty.enum, [200, 404, 'server_error'])

    // Array of enums
    const availableColorsProperty = result.schema.properties.availableColors
    assert.strictEqual(availableColorsProperty.type, 'array')
    assert.strictEqual(availableColorsProperty.items.type, 'string')
    assert.deepStrictEqual(availableColorsProperty.items.enum, [
      'red',
      'green',
      'blue',
    ])

    // Required array of enums
    const supportedSizesProperty = result.schema.properties.supportedSizes
    assert.strictEqual(supportedSizesProperty.type, 'array')
    assert.strictEqual(supportedSizesProperty.items.type, 'number')
    assert.deepStrictEqual(supportedSizesProperty.items.enum, [0, 1, 2])

    // Check required properties
    assert.ok(result.schema.required.includes('primaryColor'))
    assert.ok(result.schema.required.includes('supportedSizes'))
    assert.ok(!result.schema.required.includes('size'))
    assert.ok(!result.schema.required.includes('status'))
    assert.ok(!result.schema.required.includes('availableColors'))
  })
})
