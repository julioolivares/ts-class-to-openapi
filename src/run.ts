import { transform } from './transformer.js'

import { Product } from '../test/entities/pure-classes.js'

const { name, schema } = transform(Product)

console.log(JSON.stringify({ name, schema }, null, 2))
