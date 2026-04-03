import { transform } from './index.js'

class BasePaginatedResponse<Entity> {
  cursor: string

  rows: Entity[]

  next: boolean

  prev: boolean
}

class User {
  id: number

  name: string

  email: string

  password: string

  createdAt: Date

  updatedAt: Date
}

const schema = transform(BasePaginatedResponse<User>)

console.log(JSON.stringify(schema, null, 2))
