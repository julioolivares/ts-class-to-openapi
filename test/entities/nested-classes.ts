/**
 * Nested TypeScript classes to test object relationships
 */

export class Address {
  street: string
  city: string
  state: string
  zipCode: string
  country: string
}

export class Role {
  id: number
  name: string
  permissions: string[]
  level: number
}

export class Company {
  name: string
  industry: string
  foundedYear: number
  employees: number
}

export class EmergencyContact {
  name: string
  phone: string
  relationship: string
}

export class NestedUser {
  id: number
  name: string
  email: string
  address: Address
  roles: Role[]
  company: Company
  alternativeAddresses: Address[]
  emergencyContact?: EmergencyContact
}

/**
 * Deep nesting example
 */
export class Department {
  id: number
  name: string
  budget: number
}

export class Team {
  id: number
  name: string
  department: Department
  members: TeamMember[]
}

export class TeamMember {
  id: number
  name: string
  email: string
  role: string
  startDate: Date
}

export class Subsidiary {
  name: string
  location: Address
  established: Date
}

export class Organization {
  id: number
  name: string
  teams: Team[]
  headquarters: Address
  subsidiaries: Subsidiary[]
}
