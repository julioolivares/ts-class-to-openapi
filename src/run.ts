import {
  paginatedModule,
  UserReference,
} from '../test/entities/evaluation/baePaginatedResponse-classes.js'
import { transform } from './index.js'

const schema = transform(paginatedModule.UserPaginated)

console.log(JSON.stringify(schema, null, 2))
