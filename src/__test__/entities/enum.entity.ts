import { IsEnum, IsNotEmpty, IsArray } from 'class-validator'

// Primitive enum (string)
enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
}

// Numeric enum
enum Priority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
}

// Object enum
const Status = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
} as const

// Boolean-like enum (using strings)
enum BooleanEnum {
  TRUE = 'true',
  FALSE = 'false',
}

export class EnumTestEntity {
  @IsEnum(UserRole)
  @IsNotEmpty()
  role: UserRole

  @IsEnum(Priority)
  priority?: Priority

  @IsEnum(Status)
  status?: keyof typeof Status

  @IsEnum(BooleanEnum)
  flag?: BooleanEnum

  @IsEnum(UserRole)
  @IsArray()
  roles?: UserRole[]

  @IsEnum(Priority)
  @IsArray()
  priorities?: Priority[]

  // Optional enum property
  @IsEnum(UserRole)
  optionalRole?: UserRole
}

export { UserRole, Priority, Status, BooleanEnum }
