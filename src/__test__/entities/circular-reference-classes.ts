/**
 * Test classes for circular reference scenarios
 * These classes are designed to test the handling of recursive references
 */

/**
 * Self-referencing class through direct property
 */
export class SelfReferenceDirectClass {
  id: number
  name: string
  // Direct self-reference
  parent?: SelfReferenceDirectClass
  // Array of self-references
  children: SelfReferenceDirectClass[]
}

/**
 * Metadata class for nested circular references
 */
export class NestedMetadata {
  // Reference back to parent class
  createdBy?: SelfReferenceNestedClass
  modifiedBy?: SelfReferenceNestedClass
}

/**
 * Self-referencing class through nested property
 */
export class SelfReferenceNestedClass {
  id: number
  // Nested class with back-references
  metadata: NestedMetadata
}

/**
 * Second class in indirect circular reference
 */
export class NodeDataClass {
  description: string
  // Back reference creating a circular dependency
  parentNode: NodeClass
}

/**
 * First class in indirect circular reference
 */
export class NodeClass {
  id: number
  name: string
  // Reference to intermediate class that references back
  nodeData: NodeDataClass
}

/**
 * Third class in deep circular chain
 */
export class ClassC {
  id: number
  value: number
  // Reference back to first class, creating a cycle
  nextRef: ClassA
}

/**
 * Second class in deep circular chain
 */
export class ClassB {
  id: number
  description: string
  // Reference to next class in chain
  nextRef: ClassC
}

/**
 * First class in deep circular chain
 */
export class ClassA {
  id: number
  name: string
  // Reference to next class in chain
  nextRef: ClassB
}

/**
 * Multiple circular paths in the same class
 */
export class MultiPathCircularClass {
  id: number
  // Self reference path 1
  selfRef1?: MultiPathCircularClass
  // Self reference path 2
  selfRef2?: MultiPathCircularClass
  // Array of self references
  manyRefs: MultiPathCircularClass[]
}

/**
 * Base generic class that can create circular references
 */
export class GenericContainer<T> {
  value: T
  metadata: Record<string, any>
  // Self reference using the same type parameter
  related?: GenericContainer<T>
}

/**
 * Concrete implementation with self-reference
 */
export class SelfReferencingGenericClass extends GenericContainer<SelfReferencingGenericClass> {
  id: number
  name: string
}

/**
 * Classes for deeply nested circular references
 */

export class Level3 {
  data: boolean
  // Circular reference back to the root class
  refToRoot?: DeepNestedProperClasses
}

export class Level2 {
  data: number
  level3: Level3
}

export class Level1 {
  data: string
  level2: Level2
}

export class DeepNestedProperClasses {
  id: number
  level1: Level1
}
