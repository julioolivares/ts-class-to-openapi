import { IsEnum, IsInt, IsString, IsOptional } from 'class-validator'

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest',
}

export enum OrderStatus {
  PENDING = 0,
  PROCESSING = 1,
  SHIPPED = 2,
  DELIVERED = 3,
  CANCELLED = 4,
}

export enum MixedEnum {
  YES = 'yes',
  NO = 0,
}

export class EnumTestEntity {
  @IsEnum(UserRole)
  role: UserRole

  @IsEnum(OrderStatus)
  status: OrderStatus

  @IsOptional()
  @IsEnum(MixedEnum)
  mixed: MixedEnum
}

export class ArrayEnumTestEntity {
  @IsEnum(UserRole, { each: true })
  roles: UserRole[]

  @IsEnum(OrderStatus, { each: true })
  statuses: OrderStatus[]

  @IsOptional()
  files: UploadFileDto[]
}

class UploadFileDto {
  name: string
  type: string
  size: number
}

export class PureEnumTestEntity {
  role: UserRole
  status: OrderStatus
  mixed: MixedEnum
  files?: UploadFileDto[]
}
