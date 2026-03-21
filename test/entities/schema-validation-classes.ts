/**
 * Classes for testing schema validation
 */

export class TypeMappingTest {
  stringProp: string
  numberProp: number
  integerProp: number
  booleanProp: boolean
  dateProp: Date
  arrayProp: string[]
  objectProp: { key: string }
}

export class NestedSchema {
  nested: Nested
}

class Nested {
  level1: Level1
  simple: boolean
}

class Level1 {
  level2: string
  array: number[]
}

export class CircularA {
  name: string
  b?: CircularB
}

export class CircularB {
  value: number
  a?: CircularA
}

export class RequiredFieldsTest {
  required1: string
  required2: number
  optional1?: boolean
  optional2?: Date
  required3: string[]
}
