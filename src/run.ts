import { transform } from './transformer2.0.js'
import { Server } from 'socket.io'
class User {
  id: number
  name: string
  email: string
  isActive: boolean
  tags: string[]
  roles: Role[]
  mainRole: Role
  actionRoles: ActionRole[]
  server: Server
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
