/**
 * Debug test to understand the actual schema structure
 */
import { test, describe } from 'node:test'
import assert from 'node:assert'
import { transform } from '../../index.js'
import { PureUser, SimplePerson } from '../entities/pure-classes.js'
import { DecoratedUser } from '../entities/decorated-classes.js'

describe('Debug Schema Structure', () => {
  test('debug PureUser schema structure', () => {
    const result = transform(PureUser)

    // Force a failure to see the actual structure
    assert.strictEqual(
      typeof result,
      'DEBUGGING',
      `Actual result type: ${typeof result}, value: ${JSON.stringify(result, null, 2)}`
    )
  })

  test('debug SimplePerson age property', () => {
    const result = transform(SimplePerson)

    if (
      result &&
      result.schema &&
      result.schema.properties &&
      result.schema.properties.age
    ) {
      // Force a failure to see the actual type
      assert.strictEqual(
        result.schema.properties.age.type,
        'DEBUGGING',
        `Actual age type: ${result.schema.properties.age.type}`
      )
    } else {
      assert.fail(
        `SimplePerson schema structure: ${JSON.stringify(result, null, 2)}`
      )
    }
  })

  test('debug DecoratedUser status property', () => {
    const result = transform(DecoratedUser)

    if (
      result &&
      result.schema &&
      result.schema.properties &&
      result.schema.properties.status
    ) {
      // Force a failure to see the actual status property
      assert.strictEqual(
        result.schema.properties.status.enum,
        'DEBUGGING',
        `Actual status property: ${JSON.stringify(result.schema.properties.status, null, 2)}`
      )
    } else {
      assert.fail(
        `DecoratedUser schema structure: ${JSON.stringify(result, null, 2)}`
      )
    }
  })
})
