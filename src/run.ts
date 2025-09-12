import { transform } from './transformer2.0.js'

class User {
  id: number
  name: string
  email: string
  isActive: boolean
  tags: string[]
  roles: Role[]
  mainRole: Role
  // actionRoles: ActionRole[]
}

class Role {
  id: number
  name: string
}

class ActionRole {
  role: Role
  action: string
  isActive: boolean
}

const { name, schema } = transform(User)
