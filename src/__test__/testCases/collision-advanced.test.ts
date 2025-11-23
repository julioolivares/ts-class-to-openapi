
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { transform } from '../../transformer'
import { ThrowingClass as ClassA } from '../entities/collision/throwing/class-a'
import { ThrowingClass as ClassB } from '../entities/collision/throwing/class-b'
import { ArrayCollision as StringArrayClass } from '../entities/collision/arrays/string-array'
import { ArrayCollision as NumberArrayClass } from '../entities/collision/arrays/number-array'

describe('Advanced Class Collision Handling', () => {
  it('should correctly identify throwing classes using metadata or other means', () => {
    // This is expected to fail currently if we rely only on instantiation
    const { schema: schemaA } = transform(ClassA)
    assert.strictEqual(schemaA.properties?.['uniqueA']?.type, 'string', 'Should find uniqueA in ClassA')
    assert.strictEqual(schemaA.properties?.['uniqueB'], undefined, 'Should not find uniqueB in ClassA')

    const { schema: schemaB } = transform(ClassB)
    assert.strictEqual(schemaB.properties?.['uniqueB']?.type, 'boolean', 'Should find uniqueB in ClassB')
    assert.strictEqual(schemaB.properties?.['uniqueA'], undefined, 'Should not find uniqueA in ClassB')
  })

  it('should correctly identify classes with different array content types', () => {
    // This is expected to fail currently as checkTypeMatch is loose for arrays
    const { schema: schemaString } = transform(StringArrayClass)
    assert.strictEqual(schemaString.properties?.['tags'].items?.type, 'string', 'Should identify string array')

    const { schema: schemaNumber } = transform(NumberArrayClass)
    assert.strictEqual(schemaNumber.properties?.['tags'].items?.type, 'number', 'Should identify number array')
  })
})
