import {
  paginatedModule,
  UserReference,
} from '../test/entities/evaluation/baePaginatedResponse-classes.js'

import { SimplePerson } from '../test/entities/pure-classes.js'

import { transform } from './index.js'

const schema = transform(paginatedModule.BasePaginatedResponse<SimplePerson>)

console.log(JSON.stringify(schema, null, 2))
