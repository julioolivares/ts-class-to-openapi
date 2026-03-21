import { IsBoolean } from 'class-validator'

export class ThrowingClass {
  @IsBoolean()
  uniqueB: boolean
}
