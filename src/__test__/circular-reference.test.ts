import { describe, it } from 'node:test'
import assert from 'node:assert'
import { SchemaTransformer } from '../transformer.js'
import { 
  CircularUser, 
  CircularRole, 
  CircularOrganization,
  DeepCircularA,
  DeepCircularB,
  DeepCircularC,
  DeepCircularD
} from './entities/circular.entity.js'

describe('Circular Reference Tests', () => {
  it('should handle circular references without infinite recursion - CircularUser', () => {
    const transformer = SchemaTransformer.getInstance()
    
    // This should not cause infinite recursion
    const result = transformer.transform(CircularUser)
    
    assert.ok(result, 'Result should be defined')
    assert.strictEqual(result.name, 'CircularUser', 'Should return correct class name')
    assert.strictEqual(result.schema.type, 'object', 'Should be object type')
    
    // Check that properties exist
    assert.ok(result.schema.properties.id, 'Should have id property')
    assert.ok(result.schema.properties.name, 'Should have name property')
    assert.ok(result.schema.properties.role, 'Should have role property')
    
    // Check that circular reference is handled (should be object type, not infinite nesting)
    assert.strictEqual(result.schema.properties.role.type, 'object', 'Role should be object type')
  })

  it('should handle circular references without infinite recursion - CircularRole', () => {
    const transformer = SchemaTransformer.getInstance()
    
    // This should not cause infinite recursion
    const result = transformer.transform(CircularRole)
    
    assert.ok(result, 'Result should be defined')
    assert.strictEqual(result.name, 'CircularRole', 'Should return correct class name')
    assert.strictEqual(result.schema.type, 'object', 'Should be object type')
    
    // Check that properties exist
    assert.ok(result.schema.properties.id, 'Should have id property')
    assert.ok(result.schema.properties.name, 'Should have name property')
    assert.ok(result.schema.properties.assignedBy, 'Should have assignedBy property')
    
    // Check that circular reference is handled (should be object type, not infinite nesting)
    assert.strictEqual(result.schema.properties.assignedBy.type, 'object', 'AssignedBy should be object type')
  })

  it('should not create infinite nested objects in circular references', () => {
    const transformer = SchemaTransformer.getInstance()
    
    const userResult = transformer.transform(CircularUser)
    
    // The role property should be an object but not infinitely nested
    const roleProperty = userResult.schema.properties.role
    assert.strictEqual(roleProperty.type, 'object', 'Role should be object type')
    
    // Check that we don't have infinite nesting
    // If there's a properties field, it should not contain deeply nested circular references
    if (roleProperty.properties) {
      // If assignedBy exists, it should be a reference, not another fully nested object
      if (roleProperty.properties.assignedBy) {
        assert.strictEqual(
          roleProperty.properties.assignedBy.type, 
          'object', 
          'Nested circular reference should be simple object type'
        )
        
        // Should not have infinite nesting - no properties.assignedBy.properties.role.properties...
        assert.ok(
          !roleProperty.properties.assignedBy.properties?.role?.properties?.assignedBy,
          'Should not have deep circular nesting'
        )
      }
    }
    
    // Additionally, check that the circular reference description is present
    if (roleProperty.properties && roleProperty.properties.assignedBy) {
      const assignedByProperty = roleProperty.properties.assignedBy
      if (assignedByProperty.description) {
        assert.ok(
          assignedByProperty.description.includes('circular reference detected'),
          'Should have circular reference detection message'
        )
      }
    }
  })

  it('should handle circular references in array types', () => {
    const transformer = SchemaTransformer.getInstance()
    
    // Test both classes to ensure they handle circular references
    const userResult = transformer.transform(CircularUser)
    const roleResult = transformer.transform(CircularRole)
    
    // Verify both results are objects
    assert.strictEqual(userResult.schema.type, 'object', 'User schema should be object type')
    assert.strictEqual(roleResult.schema.type, 'object', 'Role schema should be object type')
    
    // Verify that properties exist without infinite recursion
    assert.ok(userResult.schema.properties.role, 'User should have role property')
    assert.ok(roleResult.schema.properties.assignedBy, 'Role should have assignedBy property')
    
    // The properties should be simple object types, not infinitely nested
    assert.strictEqual(
      userResult.schema.properties.role.type, 
      'object', 
      'User role property should be object type'
    )
    assert.strictEqual(
      roleResult.schema.properties.assignedBy.type, 
      'object', 
      'Role assignedBy property should be object type'
    )
  })

  it('should cache circular reference resolutions efficiently', () => {
    const transformer = SchemaTransformer.getInstance()
    
    // Transform the same classes multiple times
    const userResult1 = transformer.transform(CircularUser)
    const userResult2 = transformer.transform(CircularUser)
    const roleResult1 = transformer.transform(CircularRole)
    const roleResult2 = transformer.transform(CircularRole)
    
    // Results should be consistent (cached properly)
    assert.deepStrictEqual(userResult1, userResult2, 'User results should be identical when cached')
    assert.deepStrictEqual(roleResult1, roleResult2, 'Role results should be identical when cached')
    
    // Both should still be valid object schemas
    assert.strictEqual(userResult1.schema.type, 'object', 'Cached user schema should be object type')
    assert.strictEqual(roleResult1.schema.type, 'object', 'Cached role schema should be object type')
  })

  it('should handle complex circular references with multiple classes - CircularOrganization', () => {
    const transformer = SchemaTransformer.getInstance()
    
    // This should not cause infinite recursion despite multiple circular references
    const result = transformer.transform(CircularOrganization)
    
    assert.ok(result, 'Result should be defined')
    assert.strictEqual(result.name, 'CircularOrganization', 'Should return correct class name')
    assert.strictEqual(result.schema.type, 'object', 'Should be object type')
    
    // Check that all properties exist
    assert.ok(result.schema.properties.id, 'Should have id property')
    assert.ok(result.schema.properties.name, 'Should have name property')
    assert.ok(result.schema.properties.owner, 'Should have owner property')
    assert.ok(result.schema.properties.defaultRole, 'Should have defaultRole property')
    assert.ok(result.schema.properties.members, 'Should have members property')
    assert.ok(result.schema.properties.availableRoles, 'Should have availableRoles property')
    assert.ok(result.schema.properties.parentOrganization, 'Should have parentOrganization property')
    assert.ok(result.schema.properties.childOrganizations, 'Should have childOrganizations property')
    
    // Verify that circular references are handled (should be object types, not infinite nesting)
    assert.strictEqual(result.schema.properties.owner.type, 'object', 'Owner should be object type')
    assert.strictEqual(result.schema.properties.defaultRole.type, 'object', 'DefaultRole should be object type')
    assert.strictEqual(result.schema.properties.members.type, 'array', 'Members should be array type')
    assert.strictEqual(result.schema.properties.availableRoles.type, 'array', 'AvailableRoles should be array type')
    assert.strictEqual(result.schema.properties.parentOrganization.type, 'object', 'ParentOrganization should be object type')
    assert.strictEqual(result.schema.properties.childOrganizations.type, 'array', 'ChildOrganizations should be array type')
  })

  it('should handle self-referencing classes without infinite recursion', () => {
    const transformer = SchemaTransformer.getInstance()
    
    const orgResult = transformer.transform(CircularOrganization)
    
    // The parentOrganization should be an object but not infinitely nested
    const parentOrgProperty = orgResult.schema.properties.parentOrganization
    assert.strictEqual(parentOrgProperty.type, 'object', 'ParentOrganization should be object type')
    
    // The childOrganizations should be an array of objects
    const childOrgsProperty = orgResult.schema.properties.childOrganizations
    assert.strictEqual(childOrgsProperty.type, 'array', 'ChildOrganizations should be array type')
    
    // Check that self-references don't create infinite nesting
    if (parentOrgProperty.properties) {
      // If the parent organization has a parentOrganization, it should be a simple reference
      if (parentOrgProperty.properties.parentOrganization) {
        assert.strictEqual(
          parentOrgProperty.properties.parentOrganization.type,
          'object',
          'Nested self-reference should be simple object type'
        )
        
        // Should not have deep nesting
        assert.ok(
          !parentOrgProperty.properties.parentOrganization.properties?.parentOrganization?.properties,
          'Should not have deep self-reference nesting'
        )
      }
    }
  })

  it('should handle multi-level circular references between all three classes', () => {
    const transformer = SchemaTransformer.getInstance()
    
    // Transform all three classes that have circular references to each other
    const userResult = transformer.transform(CircularUser)
    const roleResult = transformer.transform(CircularRole)
    const orgResult = transformer.transform(CircularOrganization)
    
    // All should be successful
    assert.strictEqual(userResult.schema.type, 'object', 'User schema should be object type')
    assert.strictEqual(roleResult.schema.type, 'object', 'Role schema should be object type')
    assert.strictEqual(orgResult.schema.type, 'object', 'Organization schema should be object type')
    
    // User should have references to Role and Organization
    assert.ok(userResult.schema.properties.role, 'User should have role property')
    assert.ok(userResult.schema.properties.organization, 'User should have organization property')
    assert.ok(userResult.schema.properties.organizations, 'User should have organizations property')
    
    // Role should have references to User and Organization
    assert.ok(roleResult.schema.properties.assignedBy, 'Role should have assignedBy property')
    assert.ok(roleResult.schema.properties.organization, 'Role should have organization property')
    assert.ok(roleResult.schema.properties.usersWithRole, 'Role should have usersWithRole property')
    
    // Organization should have references to User, Role, and itself
    assert.ok(orgResult.schema.properties.owner, 'Organization should have owner property')
    assert.ok(orgResult.schema.properties.defaultRole, 'Organization should have defaultRole property')
    assert.ok(orgResult.schema.properties.parentOrganization, 'Organization should have parentOrganization property')
    assert.ok(orgResult.schema.properties.childOrganizations, 'Organization should have childOrganizations property')
  })

  it('should handle arrays of circular references efficiently', () => {
    const transformer = SchemaTransformer.getInstance()
    
    const orgResult = transformer.transform(CircularOrganization)
    
    // Check array properties with circular references
    const membersProperty = orgResult.schema.properties.members
    const availableRolesProperty = orgResult.schema.properties.availableRoles
    const childOrgsProperty = orgResult.schema.properties.childOrganizations
    
    // All should be arrays
    assert.strictEqual(membersProperty.type, 'array', 'Members should be array type')
    assert.strictEqual(availableRolesProperty.type, 'array', 'AvailableRoles should be array type')
    assert.strictEqual(childOrgsProperty.type, 'array', 'ChildOrganizations should be array type')
    
    // Array items should be objects (not infinitely nested)
    if (membersProperty.items) {
      assert.strictEqual(membersProperty.items.type, 'object', 'Members items should be object type')
    }
    if (availableRolesProperty.items) {
      assert.strictEqual(availableRolesProperty.items.type, 'object', 'AvailableRoles items should be object type')
    }
    if (childOrgsProperty.items) {
      assert.strictEqual(childOrgsProperty.items.type, 'object', 'ChildOrganizations items should be object type')
    }
  })

  it('should handle deep circular reference chains (A->B->C->D->A)', () => {
    const transformer = SchemaTransformer.getInstance()
    
    // Test all classes in the deep circular chain
    const resultA = transformer.transform(DeepCircularA)
    const resultB = transformer.transform(DeepCircularB)
    const resultC = transformer.transform(DeepCircularC)
    const resultD = transformer.transform(DeepCircularD)
    
    // All should be successful
    assert.strictEqual(resultA.schema.type, 'object', 'DeepCircularA schema should be object type')
    assert.strictEqual(resultB.schema.type, 'object', 'DeepCircularB schema should be object type')
    assert.strictEqual(resultC.schema.type, 'object', 'DeepCircularC schema should be object type')
    assert.strictEqual(resultD.schema.type, 'object', 'DeepCircularD schema should be object type')
    
    // Check that each class has its reference property
    assert.ok(resultA.schema.properties.reference, 'DeepCircularA should have reference property')
    assert.ok(resultB.schema.properties.reference, 'DeepCircularB should have reference property')
    assert.ok(resultC.schema.properties.reference, 'DeepCircularC should have reference property')
    assert.ok(resultD.schema.properties.reference, 'DeepCircularD should have reference property')
    
    // All references should be object types (not infinitely nested)
    assert.strictEqual(resultA.schema.properties.reference.type, 'object', 'A->B reference should be object type')
    assert.strictEqual(resultB.schema.properties.reference.type, 'object', 'B->C reference should be object type')
    assert.strictEqual(resultC.schema.properties.reference.type, 'object', 'C->D reference should be object type')
    assert.strictEqual(resultD.schema.properties.reference.type, 'object', 'D->A reference should be object type')
  })

  it('should handle complex object with multiple circular references', () => {
    const transformer = SchemaTransformer.getInstance()
    
    const resultD = transformer.transform(DeepCircularD)
    
    // DeepCircularD has the most complex structure
    assert.ok(resultD.schema.properties.allReferences, 'Should have allReferences property')
    assert.ok(resultD.schema.properties.arrayReferences, 'Should have arrayReferences property')
    
    // allReferences should be an object with nested properties
    const allRefsProperty = resultD.schema.properties.allReferences
    assert.strictEqual(allRefsProperty.type, 'object', 'allReferences should be object type')
    
    // arrayReferences should be an array
    const arrayRefsProperty = resultD.schema.properties.arrayReferences
    assert.strictEqual(arrayRefsProperty.type, 'array', 'arrayReferences should be array type')
    
    // Verify that complex nested references don't cause infinite recursion
    if (allRefsProperty.properties) {
      // Each property in allReferences should be an object, not infinitely nested
      Object.values(allRefsProperty.properties).forEach((prop: any) => {
        assert.strictEqual(prop.type, 'object', 'Each reference in allReferences should be object type')
      })
    }
  })

  it('should handle performance with multiple deep circular transformations', () => {
    const transformer = SchemaTransformer.getInstance()
    
    // Measure performance - should complete quickly without stack overflow
    const startTime = Date.now()
    
    // Transform all deep circular classes multiple times
    for (let i = 0; i < 5; i++) {
      transformer.transform(DeepCircularA)
      transformer.transform(DeepCircularB)
      transformer.transform(DeepCircularC)
      transformer.transform(DeepCircularD)
    }
    
    const endTime = Date.now()
    const duration = endTime - startTime
    
    // Should complete in reasonable time (less than 1 second for 20 transformations)
    assert.ok(duration < 1000, `Performance test failed: took ${duration}ms for 20 transformations`)
    
    // All should still work correctly
    const finalResult = transformer.transform(DeepCircularD)
    assert.strictEqual(finalResult.schema.type, 'object', 'Final result should still be object type')
  })
})
