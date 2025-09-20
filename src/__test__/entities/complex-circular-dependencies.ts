/**
 * Complex inter-dependent classes with multiple circular references
 */

/**
 * Core entity with relationships to other classes
 */
export class User {
  id: number
  name: string
  email: string
  // Circular references to other classes
  posts: Post[]
  comments: Comment[]
  profile: Profile
  primaryGroup?: Group
  // Self-reference
  manager?: User
  directReports: User[]
}

/**
 * Entity with back-reference to User
 */
export class Post {
  id: number
  title: string
  content: string
  // Back reference to User
  author: User
  // Circular references to other classes
  comments: Comment[]
  categories: Category[]
  // Self-reference for related posts
  relatedPosts: Post[]
}

/**
 * Entity with multiple back-references creating complex circular dependencies
 */
export class Comment {
  id: number
  content: string
  // Back references creating circular dependencies
  author: User
  post: Post
  // Self-reference for replies
  parentComment?: Comment
  replies: Comment[]
}

/**
 * Entity with 1:1 relationship with User
 */
export class Profile {
  id: number
  bio: string
  avatar: string
  // Back reference to User
  user: User
}

/**
 * Entity with many-to-many relationship with User
 */
export class Group {
  id: number
  name: string
  description: string
  // Back references to User
  members: User[]
  admin: User
  // Self-reference for nested groups
  parentGroup?: Group
  subGroups: Group[]
}

/**
 * Entity with many-to-many relationship with Post
 */
export class Category {
  id: number
  name: string
  // Back reference to Post
  posts: Post[]
  // Self-reference for subcategories
  parentCategory?: Category
  subcategories: Category[]
}
