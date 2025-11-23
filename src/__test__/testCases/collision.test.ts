import assert from 'node:assert'
import { describe, it } from 'node:test'
import { transform } from '../../transformer'
import { SameNameClass as StringClass } from '../entities/collision/string-props/same-name'
import { SameNameClass as NumberClass } from '../entities/collision/number-props/same-name'

describe('Class Name Collision Handling', () => {
  it('should correctly identify class with string properties', () => {
    const { schema } = transform(StringClass)

    assert.strictEqual(schema.properties?.['prop1'].type, 'string')
    assert.strictEqual(schema.properties?.['prop2'].type, 'string')
    assert.strictEqual(schema.properties?.['prop3'].type, 'string')
  })

  it('should correctly identify class with number properties', () => {
    const { schema } = transform(NumberClass)

    assert.strictEqual(schema.properties?.['prop1'].type, 'number')
    assert.strictEqual(schema.properties?.['prop2'].type, 'number')
    assert.strictEqual(schema.properties?.['prop3'].type, 'number')
  })
})
