/**
 * Pure TypeScript class without any decorators
 * Used to test basic type inference and transformation
 */
export class PureUser {
  id: number
  name: string
  email: string
  age: number
  isActive: boolean
  tags: string[]
  metadata: Record<string, any>
  createdAt: Date
  phone?: string
  bio?: string
}

/**
 * Pure TypeScript class with primitive types only
 */
export class SimplePerson {
  firstName: string
  lastName: string
  age: number
  isEmployed: boolean
}

/**
 * Pure TypeScript class with arrays
 */
export class Product {
  id: number
  name: string
  price: number
  categories: string[]
  scores: number[]
  isAvailable: boolean
  description?: string
}
