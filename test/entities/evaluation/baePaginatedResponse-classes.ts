export class BasePaginatedResponse<Entity> {
  // cursor: string

  rows: Entity[]

  /* next: boolean

  prev: boolean */
}

export class UserReference {
  id: number

  name: string

  email: string

  password: string

  createdAt: Date

  updatedAt: Date
}
