import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsNumber,
} from 'class-validator'

/**
 * Entities for testing advanced circular reference scenarios
 */

/**
 * Self-referencing tree node with multiple levels of self-reference
 */
export class TreeNode {
  @IsString()
  @IsNotEmpty()
  id: string

  @IsString()
  @IsNotEmpty()
  name: string

  @IsNumber()
  level: number

  // Direct self-reference
  parent?: TreeNode

  // Array of self-references
  children: TreeNode[]

  // Reference to root node
  @IsOptional()
  root?: TreeNode

  // Array of ancestor nodes
  @IsArray()
  ancestors: TreeNode[]
}

/**
 * Complex recursive entity with nested references
 */
export class RecursiveCategory {
  @IsString()
  @IsNotEmpty()
  id: string

  @IsString()
  @IsNotEmpty()
  name: string

  // Self-reference through parent
  @IsOptional()
  parent?: RecursiveCategory

  // Array of subcategories
  @IsArray()
  subcategories: RecursiveCategory[]

  // Array of related categories
  @IsArray()
  relatedCategories: RecursiveCategory[]
}

/**
 * Mutual recursion with complex nesting
 */
export class ComplexNode {
  @IsString()
  @IsNotEmpty()
  id: string

  @IsString()
  @IsNotEmpty()
  type: string

  // Reference to ComplexEdge
  @IsArray()
  edges: ComplexEdge[]

  // Connected nodes
  @IsArray()
  connectedNodes: ComplexNode[]
}

export class ComplexEdge {
  @IsString()
  @IsNotEmpty()
  id: string

  @IsString()
  @IsNotEmpty()
  weight: string

  // References to ComplexNode
  from: ComplexNode
  to: ComplexNode

  // Array of related edges
  @IsArray()
  relatedEdges: ComplexEdge[]
}

/**
 * Multi-level recursive structure with deep nesting
 */
export class NestedRecursiveEntity {
  @IsString()
  @IsNotEmpty()
  id: string

  @IsString()
  @IsNotEmpty()
  name: string

  // Direct self-reference
  @IsOptional()
  parent?: NestedRecursiveEntity

  // Array of child entities
  @IsArray()
  children: NestedRecursiveEntity[]

  // Deep nested reference
  @IsOptional()
  deepReference?: NestedRecursiveEntity
}

/**
 * Circular reference with generic-like structure
 */
export class GenericCircular {
  @IsString()
  @IsNotEmpty()
  id: string

  @IsString()
  @IsNotEmpty()
  type: string

  // Self-reference
  reference: GenericCircular

  // Array of self-references
  @IsArray()
  references: GenericCircular[]

  // Parent reference
  @IsOptional()
  parent?: GenericCircular
}

/**
 * Entity with self-reference through unions and intersections
 */
export class UnionIntersectionEntity {
  @IsString()
  @IsNotEmpty()
  id: string

  @IsString()
  @IsNotEmpty()
  name: string

  // Self-reference
  @IsOptional()
  selfRef?: UnionIntersectionEntity

  // Array of self-references
  @IsArray()
  selfArray: UnionIntersectionEntity[]

  // Parent reference
  @IsOptional()
  parent?: UnionIntersectionEntity
}
