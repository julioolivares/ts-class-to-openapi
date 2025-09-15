/**
 * Test cases for nested TypeScript classes (complex object relationships)
 */
import { test, describe } from 'node:test'
import assert from 'node:assert'
import { transform } from '../../index.js'
import {
  NestedUser,
  Address,
  Role,
  Company,
  Organization,
  Team,
  Department,
  TeamMember,
} from '../entities/nested-classes.js'

describe('Nested TypeScript Classes', () => {
  test('should transform Address class correctly', () => {
    const result = transform(Address)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    const expectedProperties = ['street', 'city', 'state', 'zipCode', 'country']
    expectedProperties.forEach(prop => {
      assert.ok(schema.properties[prop])
      assert.strictEqual(schema.properties[prop].type, 'string')
    })

    assert.deepStrictEqual(schema.required?.sort(), expectedProperties.sort())
  })

  test('should transform Role class correctly', () => {
    const result = transform(Role)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    assert.strictEqual(schema.properties.id.type, 'number')
    assert.strictEqual(schema.properties.name.type, 'string')
    assert.strictEqual(schema.properties.permissions.type, 'array')
    assert.strictEqual(schema.properties.permissions.items.type, 'string')
    assert.strictEqual(schema.properties.level.type, 'number')
  })

  test('should transform Company class correctly', () => {
    const result = transform(Company)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    assert.strictEqual(schema.properties.name.type, 'string')
    assert.strictEqual(schema.properties.industry.type, 'string')
    assert.strictEqual(schema.properties.foundedYear.type, 'number')
    assert.strictEqual(schema.properties.employees.type, 'number')
  })

  test('should transform NestedUser class correctly', () => {
    const result = transform(NestedUser)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    // Check nested object property
    assert.strictEqual(schema.properties.address.type, 'object')
    assert.ok(schema.properties.address.properties)

    // Check array of objects
    assert.strictEqual(schema.properties.roles.type, 'array')
    assert.strictEqual(schema.properties.roles.items.type, 'object')

    // Check company nested object
    assert.strictEqual(schema.properties.company.type, 'object')
    assert.ok(schema.properties.company.properties)

    // Check array of nested objects
    assert.strictEqual(schema.properties.alternativeAddresses.type, 'array')
    assert.strictEqual(
      schema.properties.alternativeAddresses.items.type,
      'object'
    )

    // Check optional nested object
    const requiredFields = schema.required || []
    assert.ok(!requiredFields.includes('emergencyContact'))
  })

  test('should transform Organization class with deep nesting correctly', () => {
    const result = transform(Organization)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    // Check teams array with nested objects
    assert.strictEqual(schema.properties.teams.type, 'array')
    assert.strictEqual(schema.properties.teams.items.type, 'object')

    // Check headquarters nested object
    assert.strictEqual(schema.properties.headquarters.type, 'object')

    // Check subsidiaries array with inline objects
    assert.strictEqual(schema.properties.subsidiaries.type, 'array')
    assert.strictEqual(schema.properties.subsidiaries.items.type, 'object')
  })

  test('should transform Team class with multiple nested levels', () => {
    const result = transform(Team)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    // Check nested department
    assert.strictEqual(schema.properties.department.type, 'object')

    // Check array of team members
    assert.strictEqual(schema.properties.members.type, 'array')
    assert.strictEqual(schema.properties.members.items.type, 'object')
  })

  test('should transform TeamMember class correctly', () => {
    const result = transform(TeamMember)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    // Check Date type transformation
    assert.strictEqual(schema.properties.startDate.type, 'string')
    assert.strictEqual(schema.properties.startDate.format, 'date-time')
  })

  test('should transform Department class correctly', () => {
    const result = transform(Department)
    const schema = result.schema

    assert.strictEqual(schema.type, 'object')
    assert.ok(schema.properties)

    assert.strictEqual(schema.properties.id.type, 'number')
    assert.strictEqual(schema.properties.name.type, 'string')
    assert.strictEqual(schema.properties.budget.type, 'number')
  })
})
