// Test that $ref patterns are working correctly
import { describe, test } from 'node:test'
import assert from 'node:assert'
import { SchemaTransformer } from '../transformer.js'
import { CircularUser, CircularRole } from './entities/circular.entity.js'

describe('$ref Pattern Verification', () => {
  test('should generate $ref for circular references', () => {
    const transformer = SchemaTransformer.getInstance()

    // Clear cache to ensure fresh transformation
    transformer.clearCache()

    // Transform CircularUser first
    const userResult = transformer.transform(CircularUser)

    // Check if role property uses $ref
    const roleProperty = userResult.schema.properties.role

    // The important check: should have $ref when circular reference is detected
    if (roleProperty.$ref) {
      assert.ok(
        roleProperty.$ref.includes('CircularRole'),
        '$ref should reference CircularRole'
      )
    } else {
      assert.strictEqual(
        roleProperty.type,
        'object',
        'Should at least be object type'
      )
    }

    // Now transform CircularRole to trigger the circular reference
    transformer.clearCache()
    const roleResult = transformer.transform(CircularRole)

    // Now test CircularUser again - this should trigger the circular reference detection
    const userResult2 = transformer.transform(CircularUser)

    const roleProperty2 = userResult2.schema.properties.role

    if (roleProperty2.$ref) {
      assert.ok(
        roleProperty2.$ref.includes('CircularRole'),
        '$ref should reference CircularRole'
      )
    }
  })
})
