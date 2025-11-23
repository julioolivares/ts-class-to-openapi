import { transform } from './transformer'

import { PureEnumTestEntity, MixedEnum } from './__test__/entities/enum-classes'

const { name, schema } = transform(PureEnumTestEntity)

console.log(JSON.stringify({ name, schema }, null, 2))
