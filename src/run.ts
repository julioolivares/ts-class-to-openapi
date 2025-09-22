import './__test__/'
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
} from 'class-validator'

import { transform } from './transformer'
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

class UploadFile {
  filename: string
  mimetype: string
  encoding: string
  data: Buffer
}

class ActionRole {
  role: Role

  @IsArray()
  @IsOptional()
  tags: string[]

  @IsString()
  @Length(3, 20)
  action: string
  @IsBoolean()
  isActive?: boolean

  images: UploadFile[]
}

const userSchema = transform(User)

const roleSchema = transform(ActionRole)

console.log(JSON.stringify(roleSchema, null, 2))
