import { test } from 'node:test'
import assert from 'node:assert'
import { transform } from '../index.js'
import {
  TreeNode,
  RecursiveCategory,
  ComplexNode,
  ComplexEdge,
  NestedRecursiveEntity,
  GenericCircular,
  UnionIntersectionEntity,
} from './entities/advanced-circular.entity'

test('Advanced Circular Reference Detection', async t => {
  await t.test(
    'TreeNode - Self-referencing tree node with multiple levels',
    async () => {
      const result = transform(TreeNode)

      // Verificar que TreeNode tiene las propiedades correctas
      assert(result, 'TreeNode result should exist')
      assert.strictEqual(result.schema.type, 'object')

      // Verificar propiedades básicas
      assert(result.schema.properties?.id)
      assert(result.schema.properties?.name)
      assert(result.schema.properties?.level)

      // Verificar referencias circulares
      assert(result.schema.properties?.parent)
      assert(result.schema.properties?.children)
      assert(result.schema.properties?.root)
      assert(result.schema.properties?.ancestors)

      console.log('TreeNode schema:', JSON.stringify(result.schema, null, 2))
    }
  )

  await t.test(
    'RecursiveCategory - Complex recursive entity with nested references',
    async () => {
      const result = transform(RecursiveCategory)

      assert(result, 'RecursiveCategory result should exist')

      // Verificar propiedades básicas
      assert(result.schema.properties?.id)
      assert(result.schema.properties?.name)

      // Verificar referencias circulares múltiples
      assert(result.schema.properties?.parent)
      assert(result.schema.properties?.subcategories)
      assert(result.schema.properties?.relatedCategories)

      console.log(
        'RecursiveCategory schema:',
        JSON.stringify(result.schema, null, 2)
      )
    }
  )

  await t.test('ComplexNode and ComplexEdge - Mutual recursion', async () => {
    // Esta prueba debería pasar una vez que el transformador maneje correctamente
    // la recursión mutua sin caer en stack overflow

    const nodeResult = transform(ComplexNode)
    const edgeResult = transform(ComplexEdge)

    assert(nodeResult, 'ComplexNode result should exist')
    assert(edgeResult, 'ComplexEdge result should exist')

    // Verificar que ComplexNode tiene referencia a ComplexEdge
    assert(nodeResult.schema.properties?.edges)
    assert(nodeResult.schema.properties?.connectedNodes)

    // Verificar que ComplexEdge tiene referencia a ComplexNode
    assert(edgeResult.schema.properties?.from)
    assert(edgeResult.schema.properties?.to)
    assert(edgeResult.schema.properties?.relatedEdges)

    console.log(
      'ComplexNode schema:',
      JSON.stringify(nodeResult.schema, null, 2)
    )
    console.log(
      'ComplexEdge schema:',
      JSON.stringify(edgeResult.schema, null, 2)
    )
  })

  await t.test(
    'NestedRecursiveEntity - Multi-level recursive structure',
    async () => {
      const result = transform(NestedRecursiveEntity)

      assert(result, 'NestedRecursiveEntity result should exist')
      assert.strictEqual(result.schema.type, 'object')

      // Verificar todas las propiedades
      assert(result.schema.properties?.id)
      assert(result.schema.properties?.name)
      assert(result.schema.properties?.parent)
      assert(result.schema.properties?.children)
      assert(result.schema.properties?.deepReference)

      console.log(
        'NestedRecursiveEntity schema:',
        JSON.stringify(result.schema, null, 2)
      )
    }
  )

  await t.test(
    'GenericCircular - Circular reference with generic-like structure',
    async () => {
      const result = transform(GenericCircular)

      assert(result, 'GenericCircular result should exist')
      assert.strictEqual(result.schema.type, 'object')

      // Verificar propiedades
      assert(result.schema.properties?.id)
      assert(result.schema.properties?.type)
      assert(result.schema.properties?.reference)
      assert(result.schema.properties?.references)
      assert(result.schema.properties?.parent)

      console.log(
        'GenericCircular schema:',
        JSON.stringify(result.schema, null, 2)
      )
    }
  )

  await t.test(
    'UnionIntersectionEntity - Self-reference through unions and intersections',
    async () => {
      const result = transform(UnionIntersectionEntity)

      assert(result, 'UnionIntersectionEntity result should exist')
      assert.strictEqual(result.schema.type, 'object')

      // Verificar propiedades básicas
      assert(result.schema.properties?.id)
      assert(result.schema.properties?.name)
      assert(result.schema.properties?.selfRef)
      assert(result.schema.properties?.selfArray)
      assert(result.schema.properties?.parent)

      console.log(
        'UnionIntersectionEntity schema:',
        JSON.stringify(result.schema, null, 2)
      )
    }
  )
})
