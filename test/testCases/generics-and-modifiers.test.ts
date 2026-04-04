import assert from 'node:assert'
import { describe, it } from 'node:test'
import { transform } from '../../src/index.js'
import { AccessorAndModifiers } from '../entities/evaluation/modifiers.js'
import { ConcreteString } from '../entities/evaluation/generics.js'
import {
  paginatedModule,
  UserReference,
} from '../entities/evaluation/baePaginatedResponse-classes.js'

describe('Evaluation of Edge Cases', () => {
  it('should handle modifiers correctly (exclude private/static, include getters?)', () => {
    const { schema } = transform(AccessorAndModifiers)
    const props = schema.properties || {}

    // Public should be present
    assert.ok(props['publicProp'], 'Public property should be present')

    // Private/Protected/Static should ideally be excluded in an API schema
    // Checking current behavior
    console.log('Modifiers props:', Object.keys(props))

    // Getters are often treated as properties in JSON serialization
    // Checking current behavior
    if (props['computedProp']) {
      console.log('Getter is present')
    } else {
      console.log('Getter is missing')
    }
  })

  it('should handle generic inheritance', () => {
    const { schema } = transform(ConcreteString)
    const props = schema.properties || {}

    assert.ok(props['other'], 'Own property should be present')
    assert.ok(props['data'], 'Inherited property should be present')

    // The type of 'data' should be 'string', not 'T' or 'object'
    console.log('Generic data type:', props['data'].type)
    console.log(props['data'])
    assert.strictEqual(
      props['data'].type,
      'string',
      'Inherited generic type should be resolved'
    )
  })

  it('should resolve generic array property to the concrete class schema', () => {
    const { schema } = transform(paginatedModule.UserReference)
    const props = schema.properties || {}

    assert.ok(props['rows'], 'rows property should be present')
    assert.strictEqual(props['rows'].type, 'array', 'rows should be an array')
    assert.ok(props['rows'].items, 'rows should have items')
    assert.strictEqual(
      props['rows'].items.type,
      'object',
      'items should have type object'
    )
    assert.ok(props['rows'].items.properties, 'items should have properties')

    const rowProps = props['rows'].items.properties
    assert.ok(rowProps['id'], 'id should be present')
    assert.ok(rowProps['name'], 'name should be present')
    assert.ok(rowProps['email'], 'email should be present')
    assert.strictEqual(rowProps['name'].type, 'string')
    assert.strictEqual(rowProps['email'].type, 'string')
  })
})
