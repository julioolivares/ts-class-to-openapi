class BasePaginatedResponse<Entity = unknown> {
  // cursor: string

  rows: Entity[]

  cursor?: string

  next: boolean

  prev: boolean
}

class UserReference extends BasePaginatedResponse<UserReference> {
  id: number

  name: string

  email: string

  password: string

  createdAt: Date

  updatedAt: Date

  roles: Array<string>
}

export const paginatedModule = {
  BasePaginatedResponse,
  UserReference,
}

export type { BasePaginatedResponse, UserReference }
