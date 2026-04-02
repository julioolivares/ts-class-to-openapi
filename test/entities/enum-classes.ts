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

// Literal object enums (const objects used as enums)
export const StringLiteralEnum = {
  ADMIN: 'admin',
  USER: 'user',
  MODERATOR: 'moderator',
} as const

export const NumericLiteralEnum = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
} as const

export const MixedLiteralEnum = {
  YES: 'yes',
  NO: 0,
} as const

export class LiteralEnumTestEntity {
  @IsEnum(StringLiteralEnum)
  role: (typeof StringLiteralEnum)[keyof typeof StringLiteralEnum]

  @IsEnum(NumericLiteralEnum)
  priority: (typeof NumericLiteralEnum)[keyof typeof NumericLiteralEnum]

  @IsOptional()
  @IsEnum(MixedLiteralEnum)
  mixed: (typeof MixedLiteralEnum)[keyof typeof MixedLiteralEnum]
}

export class ArrayLiteralEnumTestEntity {
  @IsEnum(StringLiteralEnum, { each: true })
  roles: (typeof StringLiteralEnum)[keyof typeof StringLiteralEnum][]

  @IsEnum(NumericLiteralEnum, { each: true })
  priorities: (typeof NumericLiteralEnum)[keyof typeof NumericLiteralEnum][]
}
