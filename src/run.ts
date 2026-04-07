import {
  paginatedModule,
  UserReference,
} from '../test/entities/evaluation/baePaginatedResponse-classes.js'

class User {
  name: string

  lastName: string

  profilePicture?: File
}

import { transform } from './index.js'

const schema = transform(User)

console.log(JSON.stringify(schema, null, 2))
