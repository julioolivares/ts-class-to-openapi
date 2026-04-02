import { transform } from './index.js'
import { IsEnum } from 'class-validator'

const UserType = {
  ADMIN: 'admin',
  USER: 'user',
  MODERATOR: 'moderator',
}

enum Priority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
}

class Task {
  @IsEnum(UserType)
  assignedTo: (typeof UserType)[keyof typeof UserType]

  // Pure TypeScript enum (automatically detected without decorator)
  status: number

  @IsEnum(Priority)
  priority?: Priority

  title: string
  completed: boolean
  dueDate: Date
}

const schema = transform(Task)

console.log(JSON.stringify(schema, null, 2))
