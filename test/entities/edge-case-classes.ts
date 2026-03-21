/**
 * Classes used for edge case and error handling tests
 */

export class EmptyClass {}

export class StaticOnlyClass {
  static staticProp: string = 'test'
  static anotherStatic: number = 42
}

export class ClassWithMethods {
  name: string

  getName(): string {
    return this.name
  }

  setName(name: string): void {
    this.name = name
  }
}

export class ClassWithAccessors {
  private _value: number = 0

  get value(): number {
    return this._value
  }

  set value(val: number) {
    this._value = val
  }

  name: string
}

export class PropertyNamesTest {
  camelCase: string
  snake_case: string
  PascalCase: string
  'kebab-case': string
  $specialChar: string
}

export class ComplexUnionClass {
  stringOrNumberOrBoolean: string | number | boolean
  arrayOrObject: string[] | { key: string }
  optionalUnion?: Date | string | null
}

export class ReadonlyClass {
  readonly id: number
  readonly createdAt: Date
  name: string
}

export class AccessModifierClass {
  public publicProp: string
  private privateProp: number
  protected protectedProp: boolean
}
