/**
 * Additional test classes for pure TypeScript classes tests
 * These classes are used in the pure-classes.test.ts file
 */

export class OptionalOnlyClass {
  optionalProp?: string
  anotherOptional?: number
}

export class UnionTypeClass {
  stringOrNumber: string | number
  optionalUnion?: boolean | string
}
