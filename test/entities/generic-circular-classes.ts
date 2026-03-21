/**
 * Interfaces and classes for handling generic circular references
 */

/**
 * Interface defining the contract for metadata properties
 */
export interface IMetadata {
  createdAt?: Date
  updatedAt?: Date
  version?: number
  [key: string]: any
}

/**
 * Interface defining the contract for entities with circular references
 */
export interface ICircularReference<T> {
  getReference(): T | undefined
  setReference(ref: T): void
}

/**
 * Interface for entities that can contain related items
 */
export interface IRelatable<T> {
  related?: T
}

/**
 * Base class for containers that hold generic values with metadata
 */
export abstract class BaseContainer<T> implements IRelatable<BaseContainer<T>> {
  abstract value: T
  metadata: IMetadata
  related?: BaseContainer<T>

  constructor() {
    this.metadata = {}
  }

  protected abstract validateValue(value: T): boolean
}

/**
 * Generic container implementation with basic value validation
 */
export class GenericContainer<T> extends BaseContainer<T> {
  value: T
  metadata: IMetadata & { additionalInfo?: string }

  constructor(value: T) {
    super()
    this.value = value
    this.metadata = {}
  }

  protected validateValue(value: T): boolean {
    return value !== undefined && value !== null
  }
}

/**
 * Self-referencing class that extends GenericContainer
 */
export class SelfReferencingGenericClass
  extends GenericContainer<SelfReferencingGenericClass>
  implements ICircularReference<SelfReferencingGenericClass>
{
  id: number
  name: string

  constructor(id: number, name: string) {
    super(null as any) // Initially null, will be set after construction
    this.id = id
    this.name = name
    this.value = this // Self-reference
  }

  getReference(): SelfReferencingGenericClass | undefined {
    return this
  }

  setReference(ref: SelfReferencingGenericClass): void {
    this.related = ref
  }

  protected override validateValue(
    value: SelfReferencingGenericClass
  ): boolean {
    return value instanceof SelfReferencingGenericClass
  }
}
