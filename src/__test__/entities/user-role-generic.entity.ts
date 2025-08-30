import { IsString, IsNotEmpty, IsInt, Min } from 'class-validator'

export type User<T> = {
  _id: number
  fullName: string
  role: T
}

export class Role {
  @IsInt()
  @Min(1)
  _id: number

  @IsString()
  @IsNotEmpty()
  name: string
}

export class QuoteDto {
  @IsInt()
  @Min(1)
  _id: number

  user: User<Role>
}
