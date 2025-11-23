
import { IsString } from 'class-validator';

export class ThrowingClass {
  @IsString()
  uniqueA: string;

  constructor() {
    throw new Error("Cannot instantiate Class A");
  }
}
