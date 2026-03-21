/**
 * Classes decorated with class-validator for enhanced schema generation
 */
import {
  IsEmail,
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsEnum,
  IsDate,
  Min,
  Max,
  Length,
  Matches,
  IsBoolean,
  ValidateNested,
  IsPositive,
} from 'class-validator'

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
  SUSPENDED = 'suspended',
}

export enum Priority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4,
}

export class DecoratedAddress {
  @IsString()
  @Length(5, 100)
  street: string

  @IsString()
  @Length(2, 50)
  city: string

  @IsString()
  @Length(2, 50)
  state: string

  @IsString()
  @Matches(/^\d{5}(-\d{4})?$/)
  zipCode: string

  @IsString()
  @Length(2, 50)
  country: string
}

export class DecoratedUser {
  @IsNumber()
  @IsPositive()
  id: number

  @IsString()
  @Length(2, 50)
  name: string

  @IsEmail()
  email: string

  @IsNumber()
  @Min(18)
  @Max(120)
  age: number

  @IsEnum(UserStatus)
  status: UserStatus

  @IsBoolean()
  @IsOptional()
  isActive?: boolean

  @IsArray()
  @IsString({ each: true })
  tags: string[]

  @ValidateNested()
  address: DecoratedAddress

  @IsDate()
  createdAt: Date

  @IsOptional()
  @IsDate()
  updatedAt?: Date
}

export class DecoratedProduct {
  @IsNumber()
  @IsPositive()
  id: number

  @IsString()
  @Length(3, 100)
  name: string

  @IsString()
  @Length(10, 500)
  description: string

  @IsNumber()
  @Min(0)
  price: number

  @IsString()
  @Length(3, 20)
  currency: string

  @IsArray()
  @IsString({ each: true })
  categories: string[]

  @IsBoolean()
  inStock: boolean

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[]
}

export class DecoratedTask {
  @IsNumber()
  @IsPositive()
  id: number

  @IsString()
  @Length(5, 100)
  title: string

  @IsString()
  @Length(10, 1000)
  description: string

  @IsEnum(Priority)
  priority: Priority

  @IsBoolean()
  completed: boolean

  @IsDate()
  dueDate: Date

  @IsOptional()
  @ValidateNested()
  assignedTo?: DecoratedUser

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[]

  @IsDate()
  createdAt: Date

  @IsOptional()
  @IsDate()
  completedAt?: Date
}
