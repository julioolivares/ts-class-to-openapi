/**
 * Test cases for decorated classes using class-validator
 */
import { test, describe } from 'node:test'
import assert from 'node:assert'
import { transform } from '../../index.js'
import {
  DecoratedUser,
  DecoratedAddress,
  DecoratedProduct,
  DecoratedTask,
  UserStatus,
  Priority,
} from '../entities/decorated-classes.js'

describe('Decorated Classes with class-validator', () => {
  test('should transform DecoratedAddress with validation constraints', () => {
    const result = transform(DecoratedAddress)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    assert.strictEqual(schema.properties.street.minLength, 5)
    assert.strictEqual(schema.properties.street.maxLength, 100)

    assert.strictEqual(schema.properties.city.minLength, 2)
    assert.strictEqual(schema.properties.city.maxLength, 50)

    assert.strictEqual(schema.properties.state.minLength, 2)
    assert.strictEqual(schema.properties.state.maxLength, 50)

    assert.strictEqual(schema.properties.country.minLength, 2)
    assert.strictEqual(schema.properties.country.maxLength, 50)

    assert.strictEqual(schema.properties.zipCode.type, 'string')
  })

  test('should transform DecoratedUser with comprehensive validation', () => {
    const result = transform(DecoratedUser)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    assert.strictEqual(schema.properties.email.format, 'email')

    assert.strictEqual(schema.properties.age.minimum, 18)
    assert.strictEqual(schema.properties.age.maximum, 120)

    assert.strictEqual(schema.properties.id.minimum, 0)

    assert.strictEqual(schema.properties.name.minLength, 2)
    assert.strictEqual(schema.properties.name.maxLength, 50)

    assert.ok(schema.properties.status)

    assert.strictEqual(schema.properties.tags.type, 'array')
    assert.strictEqual(schema.properties.tags.items.type, 'string')

    assert.strictEqual(schema.properties.address.type, 'object')

    assert.strictEqual(schema.properties.createdAt.type, 'string')
    assert.strictEqual(schema.properties.createdAt.format, 'date-time')

    const requiredFields = schema.required || []
    assert.ok(!requiredFields.includes('isActive'))
    assert.ok(!requiredFields.includes('updatedAt'))
  })

  test('should transform DecoratedProduct with validation constraints', () => {
    const result = transform(DecoratedProduct)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    assert.strictEqual(schema.properties.id.minimum, 0)
    assert.strictEqual(schema.properties.price.minimum, 0)

    // Check string length constraints
    assert.strictEqual(schema.properties.name.minLength, 3)
    assert.strictEqual(schema.properties.name.maxLength, 100)

    assert.strictEqual(schema.properties.description.minLength, 10)
    assert.strictEqual(schema.properties.description.maxLength, 500)

    assert.strictEqual(schema.properties.currency.minLength, 3)
    assert.strictEqual(schema.properties.currency.maxLength, 20)

    assert.strictEqual(schema.properties.categories.type, 'array')
    assert.strictEqual(schema.properties.categories.items.type, 'string')

    assert.strictEqual(schema.properties.inStock.type, 'boolean')

    const requiredFields = schema.required || []
    assert.ok(!requiredFields.includes('quantity'))
    assert.ok(!requiredFields.includes('images'))
  })

  test('should transform DecoratedTask with enum and nested validation', () => {
    const result = transform(DecoratedTask)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    // Check string length constraints
    assert.strictEqual(schema.properties.title.minLength, 5)
    assert.strictEqual(schema.properties.title.maxLength, 100)

    assert.strictEqual(schema.properties.description.minLength, 10)
    assert.strictEqual(schema.properties.description.maxLength, 1000)

    assert.ok(schema.properties.priority)

    assert.strictEqual(schema.properties.completed.type, 'boolean')

    assert.strictEqual(schema.properties.assignedTo?.type, 'object')

    assert.strictEqual(schema.properties.dueDate.type, 'string')
    assert.strictEqual(schema.properties.dueDate.format, 'date-time')

    assert.strictEqual(schema.properties.createdAt.type, 'string')
    assert.strictEqual(schema.properties.createdAt.format, 'date-time')

    const requiredFields = schema.required || []
    assert.ok(!requiredFields.includes('assignedTo'))
    assert.ok(!requiredFields.includes('tags'))
    assert.ok(!requiredFields.includes('completedAt'))
  })

  /* Las pruebas de enums se omiten ya que el decorador @IsEnum no está implementado aún */
})
