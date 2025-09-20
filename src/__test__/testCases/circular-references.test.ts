/**
 * Test cases for circular reference handling
 * These tests verify that the transformer handles circular references properly
 * without entering infinite recursion loops
 */
import { test, describe } from 'node:test'
import assert from 'node:assert'
import { transform } from '../../index.js'
import {
  SelfReferenceDirectClass,
  SelfReferenceNestedClass,
  NestedMetadata,
  NodeClass,
  NodeDataClass,
  ClassA,
  ClassB,
  ClassC,
  MultiPathCircularClass,
  GenericContainer,
  SelfReferencingGenericClass,
  DeepNestedProperClasses,
  Level1,
  Level2,
  Level3,
} from '../entities/circular-reference-classes.js'
import {
  User,
  Post,
  Comment,
  Profile,
  Group,
  Category,
} from '../entities/complex-circular-dependencies.js'

describe('Circular Reference Detection and Handling', () => {
  test('should handle direct self-reference without infinite recursion', () => {
    // This should not throw an error or cause infinite loops
    const result = transform(SelfReferenceDirectClass)

    assert.strictEqual(result.schema.type, 'object')
    assert.ok(result.schema.properties)

    // Check that the self-reference property exists
    assert.ok(result.schema.properties.parent)

    // Check that the array of self-references exists
    assert.ok(result.schema.properties.children)
    assert.strictEqual(result.schema.properties.children.type, 'array')

    // Verify that it uses $ref for circular references instead of infinitely expanding
    const parentProp = result.schema.properties.parent
    if (parentProp.$ref) {
      assert.ok(parentProp.$ref.includes('SelfReferenceDirectClass'))
    } else {
      // If not using $ref, it should at least not be a full nested object definition
      // to avoid infinite recursion
      assert.ok(Object.keys(parentProp).length < 5)
    }
  })

  test('should handle nested self-reference without infinite recursion', () => {
    // This should not throw an error or cause infinite loops
    const result = transform(SelfReferenceNestedClass)

    assert.strictEqual(result.schema.type, 'object')
    assert.ok(result.schema.properties)

    // Check that the metadata property exists
    assert.ok(result.schema.properties.metadata)

    // Check if it's using $ref or other mechanism to prevent infinite recursion
    if (result.schema.properties.metadata.$ref) {
      assert.ok(
        result.schema.properties.metadata.$ref.includes('NestedMetadata')
      )
    } else {
      // If metadata is an object with properties, verify its properties
      const metadataSchema = result.schema.properties.metadata
      if (metadataSchema.properties) {
        // Check that the proper properties exist in the metadata
        assert.ok(metadataSchema.properties.createdBy)
        assert.ok(metadataSchema.properties.modifiedBy)

        // Check references within nested properties if they exist
        if (metadataSchema.properties.createdBy?.$ref) {
          assert.ok(
            metadataSchema.properties.createdBy.$ref.includes(
              'SelfReferenceNestedClass'
            )
          )
        }
      }
    }
  })

  test('should handle indirect circular reference through intermediate class', () => {
    // This should not throw an error or cause infinite loops
    const resultNode = transform(NodeClass)
    const resultNodeData = transform(NodeDataClass)

    assert.strictEqual(resultNode.schema.type, 'object')
    assert.strictEqual(resultNodeData.schema.type, 'object')

    // Check that the references between classes exist
    assert.ok(resultNode.schema.properties.nodeData)
    assert.ok(resultNodeData.schema.properties.parentNode)

    // Check if it's using $ref or other mechanism to prevent infinite recursion
    if (resultNode.schema.properties.nodeData.$ref) {
      assert.ok(
        resultNode.schema.properties.nodeData.$ref.includes('NodeDataClass')
      )
    }

    if (resultNodeData.schema.properties.parentNode.$ref) {
      assert.ok(
        resultNodeData.schema.properties.parentNode.$ref.includes('NodeClass')
      )
    }
  })

  test('should handle deep circular reference chain (A -> B -> C -> A)', () => {
    // This should not throw an error or cause infinite loops
    const resultA = transform(ClassA)
    const resultB = transform(ClassB)
    const resultC = transform(ClassC)

    assert.strictEqual(resultA.schema.type, 'object')
    assert.strictEqual(resultB.schema.type, 'object')
    assert.strictEqual(resultC.schema.type, 'object')

    // Check that the references between classes exist
    assert.ok(resultA.schema.properties.nextRef)
    assert.ok(resultB.schema.properties.nextRef)
    assert.ok(resultC.schema.properties.nextRef)

    // Check if it's using $ref or other mechanism to prevent infinite recursion
    if (resultA.schema.properties.nextRef.$ref) {
      assert.ok(resultA.schema.properties.nextRef.$ref.includes('ClassB'))
    }

    if (resultB.schema.properties.nextRef.$ref) {
      assert.ok(resultB.schema.properties.nextRef.$ref.includes('ClassC'))
    }

    if (resultC.schema.properties.nextRef.$ref) {
      assert.ok(resultC.schema.properties.nextRef.$ref.includes('ClassA'))
    }
  })

  test('should handle multiple circular paths in the same class', () => {
    // This should not throw an error or cause infinite loops
    const result = transform(MultiPathCircularClass)

    assert.strictEqual(result.schema.type, 'object')
    assert.ok(result.schema.properties)

    // Check that all self-reference properties exist
    assert.ok(result.schema.properties.selfRef1)
    assert.ok(result.schema.properties.selfRef2)
    assert.ok(result.schema.properties.manyRefs)

    // Check that array property is properly defined
    assert.strictEqual(result.schema.properties.manyRefs.type, 'array')

    // Verify that circular references are handled with $ref or another mechanism
    if (result.schema.properties.selfRef1.$ref) {
      assert.ok(
        result.schema.properties.selfRef1.$ref.includes(
          'MultiPathCircularClass'
        )
      )
    }

    if (result.schema.properties.selfRef2.$ref) {
      assert.ok(
        result.schema.properties.selfRef2.$ref.includes(
          'MultiPathCircularClass'
        )
      )
    }

    if (result.schema.properties.manyRefs.items?.$ref) {
      assert.ok(
        result.schema.properties.manyRefs.items.$ref.includes(
          'MultiPathCircularClass'
        )
      )
    }
  })

  test('should handle generic class with self-reference circular pattern', () => {
    // This should not throw an error
    const result = transform(SelfReferencingGenericClass)

    assert.strictEqual(result.schema.type, 'object')
    assert.ok(result.schema.properties)

    // Check that the reference property exists
    assert.ok(result.schema.properties.related)

    // Check that properties from GenericContainer and SelfReferencingGenericClass exist
    assert.ok(result.schema.properties.value)
    assert.ok(result.schema.properties.metadata)
    assert.ok(result.schema.properties.id)
    assert.ok(result.schema.properties.name)

    // The related property should reference SelfReferencingGenericClass to avoid infinite recursion
    if (result.schema.properties.related.$ref) {
      assert.ok(
        result.schema.properties.related.$ref.includes(
          'SelfReferencingGenericClass'
        )
      )
    }
  })

  test('should handle complex nested circular references with complete class hierarchy', () => {
    // This should not throw an error or cause infinite loops
    const result = transform(DeepNestedProperClasses)

    assert.strictEqual(result.schema.type, 'object')
    assert.ok(result.schema.properties)

    // Check that the main properties exist
    assert.ok(result.schema.properties.id)
    assert.ok(result.schema.properties.level1)

    // Verify proper references between classes
    if (result.schema.properties.level1.$ref) {
      assert.ok(result.schema.properties.level1.$ref.includes('Level1'))
    } else {
      // If not using $ref, it should contain the nested structure
      const level1Schema = result.schema.properties.level1
      assert.ok(level1Schema.properties?.data)
      assert.ok(level1Schema.properties?.level2)

      if (level1Schema.properties.level2.$ref) {
        assert.ok(level1Schema.properties.level2.$ref.includes('Level2'))
      } else {
        const level2Schema = level1Schema.properties.level2
        assert.ok(level2Schema.properties?.data)
        assert.ok(level2Schema.properties?.level3)

        if (level2Schema.properties.level3.$ref) {
          assert.ok(level2Schema.properties.level3.$ref.includes('Level3'))
        } else {
          const level3Schema = level2Schema.properties.level3
          assert.ok(level3Schema.properties?.data)
          assert.ok(level3Schema.properties?.refToRoot)

          // Check the circular reference at the deepest level
          if (level3Schema.properties.refToRoot.$ref) {
            assert.ok(
              level3Schema.properties.refToRoot.$ref.includes(
                'DeepNestedProperClasses'
              )
            )
          }
        }
      }
    }
  })

  test('should handle complex application model with multiple circular dependencies', () => {
    // This test uses the complex model with User, Post, Comment, etc.
    // These classes form a complex web of circular dependencies

    // Transform all the classes
    const userSchema = transform(User)
    const postSchema = transform(Post)
    const commentSchema = transform(Comment)
    const profileSchema = transform(Profile)
    const groupSchema = transform(Group)
    const categorySchema = transform(Category)

    // All transformations should complete without error
    assert.ok(userSchema.schema)
    assert.ok(postSchema.schema)
    assert.ok(commentSchema.schema)
    assert.ok(profileSchema.schema)
    assert.ok(groupSchema.schema)
    assert.ok(categorySchema.schema)

    // Verify User schema has correct references
    assert.ok(userSchema.schema.properties.posts)
    assert.ok(userSchema.schema.properties.comments)
    assert.ok(userSchema.schema.properties.profile)
    assert.ok(userSchema.schema.properties.primaryGroup)
    assert.ok(userSchema.schema.properties.manager)
    assert.ok(userSchema.schema.properties.directReports)

    // Verify Post schema has correct references
    assert.ok(postSchema.schema.properties.author)
    assert.ok(postSchema.schema.properties.comments)
    assert.ok(postSchema.schema.properties.categories)
    assert.ok(postSchema.schema.properties.relatedPosts)

    // Check for proper $ref usage in User schema
    if (userSchema.schema.properties.posts.items?.$ref) {
      assert.ok(userSchema.schema.properties.posts.items.$ref.includes('Post'))
    }

    if (userSchema.schema.properties.profile.$ref) {
      assert.ok(userSchema.schema.properties.profile.$ref.includes('Profile'))
    }

    // Check for proper $ref usage in Post schema
    if (postSchema.schema.properties.author.$ref) {
      assert.ok(postSchema.schema.properties.author.$ref.includes('User'))
    }

    // Verify proper $ref handling in circular dependencies
    if (commentSchema.schema.properties.post.$ref) {
      assert.ok(commentSchema.schema.properties.post.$ref.includes('Post'))
    }

    if (commentSchema.schema.properties.parentComment.$ref) {
      assert.ok(
        commentSchema.schema.properties.parentComment.$ref.includes('Comment')
      )
    }
  })
})
