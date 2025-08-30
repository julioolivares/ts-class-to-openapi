import { IsEnum, IsNotEmpty, IsArray } from 'class-validator'

// Comprehensive enum examples for additional testing

// String enum with auto values
enum Color {
  RED = 'red',
  GREEN = 'green',
  BLUE = 'blue',
}

// Numeric enum (auto-incremented)
enum Size {
  SMALL,
  MEDIUM,
  LARGE,
}

// Mixed enum (string and number)
enum HttpStatus {
  OK = 200,
  NOT_FOUND = 404,
  ERROR = 'server_error',
}

export class ComprehensiveEnumEntity {
  @IsEnum(Color)
  @IsNotEmpty()
  primaryColor: Color

  @IsEnum(Size)
  size?: Size

  @IsEnum(HttpStatus)
  status?: HttpStatus

  @IsEnum(Color)
  @IsArray()
  availableColors?: Color[]

  @IsEnum(Size)
  @IsArray()
  @IsNotEmpty()
  supportedSizes: Size[]
}

export { Color, Size, HttpStatus }
