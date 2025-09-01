import { test, describe } from 'node:test'
import assert from 'node:assert'
import { transform, SchemaTransformer } from '../transformer.js'
import { IsString } from 'class-validator'

describe('Singleton Behavior Tests', () => {
  test('should use the same singleton instance across all calls', () => {
    // Get instance directly
    const instance1 = SchemaTransformer.getInstance()
    const instance2 = SchemaTransformer.getInstance()

    // Should be the exact same object reference
    assert.strictEqual(
      instance1,
      instance2,
      'getInstance should return the same singleton instance'
    )
  })

  test('should use singleton instance in transformClass static method', () => {
    class TestClass1 {
      @IsString()
      name: string
    }

    class TestClass2 {
      @IsString()
      value: string
    }

    // Clear cache to ensure we're testing fresh
    const instance = SchemaTransformer.getInstance()
    instance.clearCache()

    // Transform using static method
    const result1 = SchemaTransformer.transformClass(TestClass1)

    // Transform using instance method
    const result2 = instance.transform(TestClass2)

    // Transform using exported function
    const result3 = transform(TestClass1) // Should use cache

    // All should work correctly
    assert.strictEqual(result1.name, 'TestClass1')
    assert.strictEqual(result2.name, 'TestClass2')
    assert.strictEqual(result3.name, 'TestClass1')

    // Verify properties are correct
    assert.strictEqual(result1.schema.properties.name.type, 'string')
    assert.strictEqual(result2.schema.properties.value.type, 'string')
    assert.strictEqual(result3.schema.properties.name.type, 'string')
  })

  test('should maintain cache across different transformation methods', () => {
    class CacheTestClass {
      @IsString()
      cachedProp: string
    }

    const instance = SchemaTransformer.getInstance()
    instance.clearCache()

    // First transformation using static method
    const result1 = SchemaTransformer.transformClass(CacheTestClass)

    // Second transformation using exported function (should hit cache)
    const result2 = transform(CacheTestClass)

    // Third transformation using instance method (should hit cache)
    const result3 = instance.transform(CacheTestClass)

    // All results should be identical since they come from the same cache
    assert.deepStrictEqual(result1, result2)
    assert.deepStrictEqual(result2, result3)
    assert.deepStrictEqual(result1, result3)
  })
})
