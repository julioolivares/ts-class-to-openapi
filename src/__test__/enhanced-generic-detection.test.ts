import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { SchemaTransformer } from '../transformer.js'
import { Server } from 'socket.io'

class Data {
  id: number
  name: string
  value: number
}

class GenericTestEntity<T> {
  id: number
  data: T
  items: T[]
}

class ComplexGenericEntity {
  id: number
  partialData: Partial<Data>
  requiredData: Required<Data>
  pickedData: Pick<Data, 'name' | 'value'>
  arrayData: Data[]
  recordData: Data
  server: Server
}

describe('Enhanced Generic Type Detection', () => {
  let transformer: SchemaTransformer

  beforeEach(() => {
    // Clear any existing instance before each test
    SchemaTransformer.disposeInstance()
    transformer = SchemaTransformer.getInstance()
  })

  /*   afterEach(() => {
    // Clean up after each test
    transformer.clearCache()
    SchemaTransformer.disposeInstance()
  }) */

  describe('isGenericTypeFromNode', () => {
    test('should detect type references with type arguments', () => {
      // This would be tested through property analysis
      // since isGenericTypeFromNode is private
      const result = transformer.transform(ComplexGenericEntity)
      console.log(JSON.stringify(result.schema, null, 2))
      assert.strictEqual(result.name, 'ComplexGenericEntity')
      assert.strictEqual(result.schema.type, 'object')
      assert.ok(result.schema.properties)
    })
  })
  /* 
  describe('isPropertyTypeGeneric', () => {
    test('should correctly identify generic properties in schema generation', () => {
      const result = transformer.transform(ComplexGenericEntity)

      // The partialData property should be handled as a generic type
      assert.ok(result.schema.properties.partialData)

      // The requiredData property should be handled as a generic type
      assert.ok(result.schema.properties.requiredData)

      // Array types should be handled correctly
      assert.ok(result.schema.properties.arrayData)
      assert.strictEqual(result.schema.properties.arrayData.type, 'array')
    })
  })

  describe('mapGenericTypeToSchema', () => {
    test('should handle Partial<T> utility types correctly', () => {
      const result = transformer.transform(ComplexGenericEntity)

      // Partial<TestInterface> should make all properties optional
      const partialDataSchema = result.schema.properties.partialData
      assert.ok(partialDataSchema)

      // For Partial types, required array should be empty or minimal
      if (partialDataSchema.required) {
        assert.ok(
          partialDataSchema.required.length <=
            Object.keys(partialDataSchema.properties || {}).length
        )
      }
    })

    test('should handle Required<T> utility types correctly', () => {
      const result = transformer.transform(ComplexGenericEntity)

      // Required<TestInterface> should make all properties required
      const requiredDataSchema = result.schema.properties.requiredData
      assert.ok(requiredDataSchema)

      // For Required types, all properties should be in required array
      if (requiredDataSchema.properties && requiredDataSchema.required) {
        assert.ok(requiredDataSchema.required.length > 0)
      }
    })

    test('should handle array types correctly', () => {
      const result = transformer.transform(ComplexGenericEntity)

      const arrayDataSchema = result.schema.properties.arrayData
      assert.ok(arrayDataSchema)
      assert.strictEqual(arrayDataSchema.type, 'array')
      assert.ok(arrayDataSchema.items)
    })
  })

  describe('enhanced generic detection vs legacy method', () => {
    test('should provide more accurate detection than string-based approach', () => {
      const result = transformer.transform(ComplexGenericEntity)

      // Verify that the schema generation completed successfully
      // This indicates that the enhanced generic detection is working
      assert.strictEqual(result.name, 'ComplexGenericEntity')
      assert.strictEqual(result.schema.type, 'object')
      assert.ok(Object.keys(result.schema.properties).includes('partialData'))
      assert.ok(Object.keys(result.schema.properties).includes('requiredData'))
      assert.ok(Object.keys(result.schema.properties).includes('arrayData'))
      assert.ok(Object.keys(result.schema.properties).includes('recordData'))
    })

    test('should not break existing functionality for non-generic types', () => {
      class SimpleEntity {
        id: number
        name: string
        active: boolean
      }

      const result = transformer.transform(SimpleEntity)

      assert.strictEqual(result.name, 'SimpleEntity')
      assert.strictEqual(result.schema.properties.id.type, 'number')
      assert.strictEqual(result.schema.properties.name.type, 'string')
      assert.strictEqual(result.schema.properties.active.type, 'boolean')
    })
  })

  describe('memory management with generic types', () => {
    test('should handle cache correctly with generic types', () => {
      // Transform the same class multiple times
      const result1 = transformer.transform(ComplexGenericEntity)
      const result2 = transformer.transform(ComplexGenericEntity)

      // Results should be consistent (from cache)
      assert.strictEqual(result1.name, result2.name)
      assert.strictEqual(
        JSON.stringify(result1.schema),
        JSON.stringify(result2.schema)
      )
    })

    test('should clear cache without issues for generic types', () => {
      transformer.transform(ComplexGenericEntity)

      // This should not throw any errors
      assert.doesNotThrow(() => {
        transformer.clearCache()
      })
    })
  }) */
})
