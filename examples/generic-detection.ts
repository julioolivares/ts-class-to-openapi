import { SchemaTransformer } from '../src/index.js'

// Example classes with generic types to test the new functionality
class GenericEntity<T> {
  id: number
  data: T
  items: T[]
  metadata: Partial<T>
  requiredData: Required<T>
}

interface UserProfile {
  name: string
  email: string
  age?: number
}

class User {
  id: number
  profile: UserProfile
  settings: Partial<UserProfile>
  fullProfile: Required<UserProfile>
  tags: string[]
  genericData: GenericEntity<UserProfile>
}

// Utility type examples
type PartialUser = Partial<User>
type RequiredUser = Required<User>

class AdvancedUser {
  id: number
  partialProfile: Partial<UserProfile>
  requiredProfile: Required<UserProfile>
  pickedData: Pick<UserProfile, 'name' | 'email'>
  records: Record<string, UserProfile>
}

// Test the enhanced generic detection
function testGenericDetection() {
  console.log('=== Testing Enhanced Generic Type Detection ===\n')

  const transformer = SchemaTransformer.getInstance()

  try {
    // Test basic class with generic properties
    console.log('1. Testing User class with generic properties:')
    const userSchema = transformer.transform(User)
    console.log(JSON.stringify(userSchema, null, 2))
    console.log('\n' + '='.repeat(50) + '\n')

    // Test advanced class with utility types
    console.log('2. Testing AdvancedUser class with utility types:')
    const advancedUserSchema = transformer.transform(AdvancedUser)
    console.log(JSON.stringify(advancedUserSchema, null, 2))
    console.log('\n' + '='.repeat(50) + '\n')

    // Clear cache for memory management demonstration
    transformer.clearCache()
    console.log('3. Cache cleared successfully')
  } catch (error) {
    console.error('Error during testing:', error)
  }
}

// Run the test
testGenericDetection()
