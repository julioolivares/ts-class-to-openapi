import assert from 'node:assert'
import { describe, it } from 'node:test'
import { transform } from '../../transformer'
import { AccessorAndModifiers } from '../entities/evaluation/modifiers'
import { ConcreteString } from '../entities/evaluation/generics'

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
})
