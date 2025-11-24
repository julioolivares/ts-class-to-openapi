export class LeafClass {
  name: string
}

export class MiddleClass {
  name: string
  leaf: LeafClass
}

export class RootClass {
  id: number
  middle: MiddleClass
  leaf: LeafClass
}

// Deep Nesting Reuse
export class DeepLeaf {
  tag: string
}

export class DeepLevel2 {
  leaf: DeepLeaf
}

export class DeepLevel1 {
  level2: DeepLevel2
}

export class DeepRoot {
  level1: DeepLevel1
  directLeaf: DeepLeaf
}

// Array Reuse
export class ArrayItem {
  id: number
}

export class ArrayRoot {
  items: ArrayItem[]
  single: ArrayItem
}

// Sibling Reuse
export class SiblingLeaf {
  value: number
}

export class SiblingRoot {
  left: SiblingLeaf
  right: SiblingLeaf
}

// Actual Circular Reference (to ensure we didn't break this)
export class CircularNode {
  name: string
  child: CircularNode
}
