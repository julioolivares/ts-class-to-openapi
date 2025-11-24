import { test } from 'node:test'
import assert from 'node:assert'
import { transform } from '../../transformer'
import {
  RootClass,
  DeepRoot,
  ArrayRoot,
  SiblingRoot,
  CircularNode,
} from '../entities/nested-reuse-classes'

test('should handle nested reused classes correctly (Diamond Problem)', async t => {
  const result = transform(RootClass)
  const schema = result.schema

  assert.strictEqual(schema.type, 'object')
  assert.ok(schema.properties)

  // Check MiddleClass property
  const middleProp = schema.properties['middle']
  assert.strictEqual(middleProp.type, 'object')
  assert.ok(middleProp.properties)

  // Check MiddleClass -> LeafClass
  const middleLeaf = middleProp.properties['leaf']
  assert.strictEqual(middleLeaf.type, 'object')
  assert.ok(middleLeaf.properties)
  assert.strictEqual(middleLeaf.properties['name'].type, 'string')

  // Check RootClass -> LeafClass (The reused one)
  // This should be fully expanded, not a $ref, because we cleared the visited status
  const rootLeaf = schema.properties['leaf']

  assert.strictEqual(rootLeaf.type, 'object')
  assert.ok(rootLeaf.properties)
  assert.strictEqual(rootLeaf.properties['name'].type, 'string')

  // Ensure it is NOT a ref
  assert.strictEqual((rootLeaf as any).$ref, undefined)
})

test('should handle deep nesting reuse correctly', async t => {
  const result = transform(DeepRoot)
  const schema = result.schema

  assert.strictEqual(schema.type, 'object')

  // Check DeepLevel1 -> DeepLevel2 -> DeepLeaf
  const level1 = schema.properties['level1']
  assert.strictEqual(level1.type, 'object')

  const level2 = level1.properties['level2']
  assert.strictEqual(level2.type, 'object')

  const deepLeaf = level2.properties['leaf']
  assert.strictEqual(deepLeaf.type, 'object')
  assert.strictEqual(deepLeaf.properties['tag'].type, 'string')

  // Check Direct Leaf
  const directLeaf = schema.properties['directLeaf']
  assert.strictEqual(directLeaf.type, 'object')
  assert.strictEqual(directLeaf.properties['tag'].type, 'string')

  // Ensure directLeaf is NOT a ref
  assert.strictEqual((directLeaf as any).$ref, undefined)
})

test('should handle array reuse correctly', async t => {
  const result = transform(ArrayRoot)
  const schema = result.schema

  assert.strictEqual(schema.type, 'object')

  // Check Array Items
  const items = schema.properties['items']
  assert.strictEqual(items.type, 'array')
  assert.strictEqual(items.items.type, 'object')
  assert.strictEqual(items.items.properties['id'].type, 'number')

  // Check Single Item
  const single = schema.properties['single']
  assert.strictEqual(single.type, 'object')
  assert.strictEqual(single.properties['id'].type, 'number')

  // Ensure single is NOT a ref
  assert.strictEqual((single as any).$ref, undefined)
})

test('should handle sibling reuse correctly', async t => {
  const result = transform(SiblingRoot)
  const schema = result.schema

  assert.strictEqual(schema.type, 'object')

  // Check Left
  const left = schema.properties['left']
  assert.strictEqual(left.type, 'object')
  assert.strictEqual(left.properties['value'].type, 'number')

  // Check Right
  const right = schema.properties['right']
  assert.strictEqual(right.type, 'object')
  assert.strictEqual(right.properties['value'].type, 'number')

  // Ensure right is NOT a ref
  assert.strictEqual((right as any).$ref, undefined)
})

test('should still handle actual circular references with $ref', async t => {
  const result = transform(CircularNode)
  const schema = result.schema

  assert.strictEqual(schema.type, 'object')

  const child = schema.properties['child']

  // Should be a ref because it's a direct self-reference (infinite loop)
  assert.ok((child as any).$ref)
  assert.match((child as any).$ref, /#\/components\/schemas\/CircularNode/)
})
