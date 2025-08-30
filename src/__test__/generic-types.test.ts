import { test, describe } from 'node:test'
import assert from 'node:assert'
import { transform } from '../index.js'
import { QuoteDto, Role } from './entities/user-role-generic.entity.js'
import {
  ProductResponseDto,
  UserListDto,
  ConfigDto,
  Product,
  UserEntity,
} from './entities/complex-generics.entity.js'

describe('Generic Types Support', () => {
  test('should handle native generic types with class parameters', () => {
    const result = transform(QuoteDto)

    assert.strictEqual(result.name, 'QuoteDto')
    assert.strictEqual(result.schema.type, 'object')
    assert.strictEqual(result.schema.properties._id.type, 'integer')

    // Verify that User<Role> type resolves correctly
    assert.ok(result.schema.properties.user)
    assert.strictEqual(result.schema.properties.user.type, 'object')

    // Verify that User<T> type properties are present
    const userProps = result.schema.properties.user.properties
    assert.ok(userProps._id)
    assert.ok(userProps.fullName)
    assert.ok(userProps.role)

    // Verify that generic type T has been substituted with Role
    assert.strictEqual(userProps.role.type, 'object')
    assert.ok(userProps.role.properties._id)
    assert.ok(userProps.role.properties.name)
    assert.strictEqual(userProps.role.properties._id.type, 'integer')
    assert.strictEqual(userProps.role.properties.name.type, 'string')

    // Verify that required fields are correct
    assert.ok(result.schema.properties.user.required.includes('_id'))
    assert.ok(result.schema.properties.user.required.includes('fullName'))
    assert.ok(result.schema.properties.user.required.includes('role'))
  })

  test('should transform Role class correctly', () => {
    const result = transform(Role)

    assert.strictEqual(result.name, 'Role')
    assert.strictEqual(result.schema.type, 'object')
    assert.strictEqual(result.schema.properties._id.type, 'integer')
    assert.strictEqual(result.schema.properties.name.type, 'string')

    // Verify that class-validator validations are applied
    assert.strictEqual(result.schema.properties._id.format, 'int32')
    assert.strictEqual(result.schema.properties._id.minimum, 1)

    // Verify required fields
    assert.ok(result.schema.required.includes('_id'))
    assert.ok(result.schema.required.includes('name'))
  })

  test('should handle ApiResponse<Product> generic type', () => {
    const result = transform(ProductResponseDto)

    assert.strictEqual(result.name, 'ProductResponseDto')
    assert.ok(result.schema.properties.response)

    const responseProps = result.schema.properties.response.properties
    assert.ok(responseProps.data, 'ApiResponse should have data property')
    assert.ok(responseProps.message, 'ApiResponse should have message property')
    assert.ok(responseProps.success, 'ApiResponse should have success property')

    // Verify that data contains Product properties
    if (responseProps.data.properties) {
      assert.ok(responseProps.data.properties.id)
      assert.ok(responseProps.data.properties.name)
      assert.ok(responseProps.data.properties.price)
    }
  })

  test('should handle PaginatedResponse<User> with arrays', () => {
    const result = transform(UserListDto)

    assert.strictEqual(result.name, 'UserListDto')
    assert.ok(result.schema.properties.users)

    const usersProps = result.schema.properties.users.properties
    assert.ok(usersProps.items, 'PaginatedResponse should have items property')
    assert.ok(usersProps.total, 'PaginatedResponse should have total property')
    assert.ok(usersProps.page, 'PaginatedResponse should have page property')
  })

  test('should handle KeyValuePair<string, number> with multiple generics', () => {
    const result = transform(ConfigDto)

    assert.strictEqual(result.name, 'ConfigDto')
    assert.ok(result.schema.properties.setting)

    const settingProps = result.schema.properties.setting.properties
    if (settingProps) {
      assert.ok(settingProps.key, 'KeyValuePair should have key property')
      assert.ok(settingProps.value, 'KeyValuePair should have value property')
    }
  })
})
