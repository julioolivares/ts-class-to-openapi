import {
  paginatedModule,
  UserReference,
} from '../test/entities/evaluation/baePaginatedResponse-classes.js'

/**
 * Represents a user in the system.
 */
class User {
  /**
   * The first name of the user.
   */
  name: string

  /**
   * The last name of the user.
   */
  lastName: string

  /**
   * The profile picture of the user.
   */
  profilePicture?: File
}

import { transform } from './index.js'

const schema = transform(User)

console.log(JSON.stringify(schema, null, 2))
