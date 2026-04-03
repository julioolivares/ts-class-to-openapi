import assert from 'node:assert'
import { describe, it } from 'node:test'
import { transform } from '../../src/index.js'
import {
  PaginatedResponse,
  SingleGeneric,
  UserEntity,
  ProductEntity,
  Address,
  PersonWithAddress,
} from '../entities/generic-args-classes.js'

describe('Generic Args - Class Reference via genericArgs', () => {
  it('should resolve generic array property with a class reference', () => {
    const { schema } = transform(PaginatedResponse<UserEntity>)
    const props = schema.properties || {}

    // Primitive properties should still work
    assert.strictEqual(props['cursor'].type, 'string')
    assert.strictEqual(props['next'].type, 'boolean')
    assert.strictEqual(props['prev'].type, 'boolean')

    // rows should be an array of UserEntity objects
    assert.strictEqual(props['rows'].type, 'array')
    assert.ok(props['rows'].items, 'rows should have items')
    assert.strictEqual(props['rows'].items.type, 'object')
    assert.ok(props['rows'].items.properties, 'items should have properties')

    const userProps = props['rows'].items.properties
    assert.ok(
      userProps['id'].type === 'number' || userProps['id'].type === 'integer',
      'id should be number or integer'
    )
    assert.strictEqual(userProps['name'].type, 'string')
    assert.strictEqual(userProps['email'].type, 'string')
    assert.strictEqual(userProps['createdAt'].type, 'string')
    assert.strictEqual(userProps['createdAt'].format, 'date-time')

    // required should include all non-optional properties
    assert.ok(props['rows'].items.required)
    assert.ok(props['rows'].items.required.includes('id'))
    assert.ok(props['rows'].items.required.includes('name'))
  })

  it('should resolve generic single property with a class reference', () => {
    const { schema } = transform(SingleGeneric<ProductEntity>)
    const props = schema.properties || {}

    // Primitive property should work
    assert.strictEqual(props['label'].type, 'string')

    // data should be a ProductEntity object
    assert.strictEqual(props['data'].type, 'object')
    assert.ok(props['data'].properties, 'data should have properties')

    const productProps = props['data'].properties
    assert.strictEqual(productProps['id'].type, 'number')
    assert.strictEqual(productProps['title'].type, 'string')
    assert.strictEqual(productProps['price'].type, 'number')
    assert.strictEqual(productProps['inStock'].type, 'boolean')
  })

  it('should resolve generic with a class that has nested class properties', () => {
    const { schema } = transform(SingleGeneric<PersonWithAddress>)
    const props = schema.properties || {}

    assert.strictEqual(props['label'].type, 'string')
    assert.strictEqual(props['data'].type, 'object')

    const personProps = props['data'].properties
    assert.strictEqual(personProps['name'].type, 'string')
    assert.strictEqual(personProps['address'].type, 'object')
    assert.ok(
      personProps['address'].properties,
      'address should have properties'
    )

    const addressProps = personProps['address'].properties
    assert.strictEqual(addressProps['street'].type, 'string')
    assert.strictEqual(addressProps['city'].type, 'string')
    assert.strictEqual(addressProps['zipCode'].type, 'string')
  })

  it('should work with different class args for same generic class', () => {
    const resultUser = transform(PaginatedResponse<UserEntity>)
    const resultProduct = transform(PaginatedResponse<ProductEntity>)

    const userRows = resultUser.schema.properties?.['rows']
    const productRows = resultProduct.schema.properties?.['rows']

    // Both should be arrays
    assert.strictEqual(userRows.type, 'array')
    assert.strictEqual(productRows.type, 'array')

    // But with different item schemas
    assert.ok(userRows.items.properties['email'], 'User should have email')
    assert.ok(
      productRows.items.properties['price'],
      'Product should have price'
    )
    assert.strictEqual(
      userRows.items.properties['price'],
      undefined,
      'User should not have price'
    )
    assert.strictEqual(
      productRows.items.properties['email'],
      undefined,
      'Product should not have email'
    )
  })
})
