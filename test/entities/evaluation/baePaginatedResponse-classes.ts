class BasePaginatedResponse<Entity> {
  // cursor: string

  rows: Entity[]

  cursor?: string

  next: boolean

  prev: boolean
}

class UserReference {
  id: number

  name: string

  email: string

  password: string

  createdAt: Date

  updatedAt: Date

  roles: Array<string>
}

class UserPaginated extends BasePaginatedResponse<UserReference> {
  // Additional properties or methods specific to user pagination can be added here
}

export const paginatedModule = {
  BasePaginatedResponse,
  UserReference,
  UserPaginated,
}

export type { BasePaginatedResponse, UserReference, UserPaginated }
