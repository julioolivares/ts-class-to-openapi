/**
 * Classes for testing schema validation
 */

export class TypeMappingTest {
  stringProp: string
  numberProp: number
  booleanProp: boolean
  arrayProp: string[]
  objectProp: Record<string, any>
  dateProp: Date
}

export class NestedSchema {
  id: number
  name: string
  nested: {
    prop1: string
    prop2: number
  }
}

export class CircularA {
  id: number
  name: string
  refToB: CircularB
}

export class CircularB {
  id: number
  description: string
  refToA: CircularA
}

export class RequiredFieldsTest {
  required1: string
  required2: number
  optional1?: string
  optional2?: number
}
