export class PaginatedResponse<Entity> {
  cursor: string

  rows: Entity[]

  next: boolean

  prev: boolean
}

export class SingleGeneric<T> {
  data: T

  label: string
}

export class UserEntity {
  id: number

  name: string

  email: string

  createdAt: Date
}

export class ProductEntity {
  id: number

  title: string

  price: number

  inStock: boolean
}

export class Address {
  street: string

  city: string

  zipCode: string
}

export class PersonWithAddress {
  name: string

  address: Address
}
