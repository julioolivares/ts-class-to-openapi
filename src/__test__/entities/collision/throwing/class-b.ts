
import { IsBoolean } from 'class-validator';

export class ThrowingClass {
  @IsBoolean()
  uniqueB: boolean;

  constructor() {
    throw new Error("Cannot instantiate Class B");
  }
}
