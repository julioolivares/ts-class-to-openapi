import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  IsEmail,
  IsArray,
} from 'class-validator'

export type ApiResponse<T> = {
  data: T
  message: string
  success: boolean
}

export type PaginatedResponse<T> = {
  items: T[]
  total: number
  page: number
}

export class Product {
  @IsInt()
  @Min(1)
  id: number

  @IsString()
  @IsNotEmpty()
  name: string

  @IsInt()
  @Min(0)
  price: number
}

export class UserEntity {
  @IsInt()
  @Min(1)
  id: number

  @IsString()
  @IsNotEmpty()
  username: string

  @IsEmail()
  email: string
}

export class ProductResponseDto {
  @IsNotEmpty()
  response: ApiResponse<Product>
}

export class UserListDto {
  @IsNotEmpty()
  users: PaginatedResponse<UserEntity>
}

export type KeyValuePair<K, V> = {
  key: K
  value: V
}

export class ConfigDto {
  @IsNotEmpty()
  setting: KeyValuePair<string, number>
}
