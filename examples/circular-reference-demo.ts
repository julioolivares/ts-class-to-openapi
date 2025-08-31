import { SchemaTransformer } from '../src/transformer.js'
import { CircularUser, CircularRole, CircularOrganization } from '../src/__test__/entities/circular.entity.js'

/**
 * Example demonstrating how circular references are handled
 * in the ts-class-to-openapi library
 */
function demonstrateCircularReferenceHandling() {
  const transformer = SchemaTransformer.getInstance()

  console.log('=== Circular Reference Handling Demo ===\n')

  console.log('1. Transforming CircularUser class (which references CircularRole):')
  try {
    const userSchema = transformer.transform(CircularUser)
    console.log('✅ Success! No infinite recursion occurred.')
    console.log('User Schema:', JSON.stringify(userSchema, null, 2))
    console.log('\n')
  } catch (error) {
    console.log('❌ Error:', error instanceof Error ? error.message : String(error))
  }

  console.log('2. Transforming CircularRole class (which references CircularUser):')
  try {
    const roleSchema = transformer.transform(CircularRole)
    console.log('✅ Success! No infinite recursion occurred.')
    console.log('Role Schema:', JSON.stringify(roleSchema, null, 2))
    console.log('\n')
  } catch (error) {
    console.log('❌ Error:', error instanceof Error ? error.message : String(error))
  }

  console.log('3. Transforming CircularOrganization class (complex multi-class circular references):')
  try {
    const orgSchema = transformer.transform(CircularOrganization)
    console.log('✅ Success! Complex circular references handled properly.')
    console.log('Organization Schema (truncated):', JSON.stringify({
      name: orgSchema.name,
      type: orgSchema.schema.type,
      properties: Object.keys(orgSchema.schema.properties),
      requiredFields: orgSchema.schema.required
    }, null, 2))
    console.log('\n')
  } catch (error) {
    console.log('❌ Error:', error instanceof Error ? error.message : String(error))
  }

  console.log('4. Verifying caching behavior:')
  try {
    const userSchema1 = transformer.transform(CircularUser)
    const userSchema2 = transformer.transform(CircularUser)
    
    const isSame = JSON.stringify(userSchema1) === JSON.stringify(userSchema2)
    console.log('✅ Caching works properly:', isSame ? 'Schemas are identical' : 'Schemas differ')
  } catch (error) {
    console.log('❌ Error:', error instanceof Error ? error.message : String(error))
  }

  console.log('\n5. Testing complex scenario with all classes:')
  try {
    console.log('Transforming all classes with circular references...')
    const userSchema = transformer.transform(CircularUser)
    const roleSchema = transformer.transform(CircularRole)
    const orgSchema = transformer.transform(CircularOrganization)
    
    console.log('✅ All transformations successful!')
    console.log('- CircularUser properties:', Object.keys(userSchema.schema.properties).length)
    console.log('- CircularRole properties:', Object.keys(roleSchema.schema.properties).length)
    console.log('- CircularOrganization properties:', Object.keys(orgSchema.schema.properties).length)
    
    // Show circular reference handling
    const orgProps = orgSchema.schema.properties
    console.log('\n📊 Complex Circular Reference Analysis:')
    console.log('- Parent Organization type:', orgProps.parentOrganization?.type)
    console.log('- Child Organizations type:', orgProps.childOrganizations?.type)
    console.log('- Owner (User) type:', orgProps.owner?.type)
    console.log('- Default Role type:', orgProps.defaultRole?.type)
    console.log('- Members (User[]) type:', orgProps.members?.type)
    console.log('- Available Roles (Role[]) type:', orgProps.availableRoles?.type)
    
  } catch (error) {
    console.log('❌ Error:', error instanceof Error ? error.message : String(error))
  }

  console.log('\n=== Demo Complete ===')
}

// Run the demonstration
demonstrateCircularReferenceHandling()
