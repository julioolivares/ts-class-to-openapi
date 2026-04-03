import {
  BasePaginatedResponse,
  UserReference,
} from '../test/entities/evaluation/baePaginatedResponse-classes.js'
import { transform } from './index.js'

const schema = transform(BasePaginatedResponse<UserReference>)

console.log(JSON.stringify(schema, null, 2))
