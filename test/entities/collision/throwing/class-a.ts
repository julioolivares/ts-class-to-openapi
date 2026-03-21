import { IsString } from 'class-validator'

export class ThrowingClass {
  @IsString()
  uniqueA: string
}
