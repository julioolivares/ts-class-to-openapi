import { IsString, IsNotEmpty } from 'class-validator'

/**
 * Example entity demonstrating circular reference issue
 * User -> Role -> User (circular)
 */
export class CircularUser {
  @IsString()
  @IsNotEmpty()
  id: string

  @IsString()
  @IsNotEmpty()
  name: string

  // This creates a circular reference: User -> Role -> User
  role: CircularRole

  // Reference to Organization (User -> Organization -> User)
  organization: CircularOrganization

  // Array of organizations the user belongs to
  organizations: CircularOrganization[]
}

export class CircularRole {
  @IsString()
  @IsNotEmpty()
  id: string

  @IsString()
  @IsNotEmpty()
  name: string

  // This creates a circular reference: Role -> User -> Role
  assignedBy: CircularUser

  // Reference to Organization (Role -> Organization -> Role)
  organization: CircularOrganization

  // Array of users with this role
  usersWithRole: CircularUser[]
}

/**
 * Example entity demonstrating complex circular references
 * Organization -> User, Role, Organization (multiple circular references)
 */
export class CircularOrganization {
  @IsString()
  @IsNotEmpty()
  id: string

  @IsString()
  @IsNotEmpty()
  name: string

  // Reference to User (User -> Role -> User -> Organization)
  owner: CircularUser

  // Reference to Role (Role -> User -> Role -> Organization)
  defaultRole: CircularRole

  // Array of users (multiple references)
  members: CircularUser[]

  // Array of roles (multiple references)
  availableRoles: CircularRole[]

  // Self-reference! Organization -> Organization
  parentOrganization?: CircularOrganization

  // Array of self-references!
  childOrganizations: CircularOrganization[]
}

/**
 * Example demonstrating deep circular reference chain
 * A -> B -> C -> D -> A (complex chain)
 */
export class DeepCircularA {
  @IsString()
  @IsNotEmpty()
  id: string

  reference: DeepCircularB
}

export class DeepCircularB {
  @IsString()
  @IsNotEmpty()
  id: string

  reference: DeepCircularC
}

export class DeepCircularC {
  @IsString()
  @IsNotEmpty()
  id: string

  reference: DeepCircularD
}

export class DeepCircularD {
  @IsString()
  @IsNotEmpty()
  id: string

  // This completes the circular chain: D -> A
  reference: DeepCircularA

  // Multiple references to test complexity
  allReferences: {
    a: DeepCircularA
    b: DeepCircularB
    c: DeepCircularC
    selfRef: DeepCircularD
  }

  // Array of all types
  arrayReferences: (DeepCircularA | DeepCircularB | DeepCircularC | DeepCircularD)[]
}
