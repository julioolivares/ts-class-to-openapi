# 🔄 ts-class-to-openapi

✨ **Transform TypeScript classes into OpenAPI 3.1.0 schemas**

A robust and efficient library that automatically transforms TypeScript classes into OpenAPI-compatible schemas. Compatible with **pure TypeScript classes** and **class-validator decorated classes**.

> **What is OpenAPI?** OpenAPI (formerly Swagger) is the industry standard for describing REST APIs. This library generates OpenAPI 3.1.0 compatible schemas that can be used for API documentation, client SDK generation, and validation.

## 🚀 Key Features

- ✅ **Direct transformation** - Convert any TypeScript class without additional configuration
- ✅ **Zero runtime dependencies** - No `reflect-metadata` or complex configurations required
- ✅ **class-validator integration** - Enrich schemas using validation decorators
- ✅ **Automatic documentation generation** - Generate Swagger documentation from existing classes
- ✅ **Native TypeScript support** - Full compatibility with enums, arrays, and nested objects

## 🎯 Quick Example

```typescript
import { transform } from 'ts-class-to-openapi'

class User {
  id: number
  name: string
  email: string
  age?: number
}

const schema = transform(User)
// Returns complete OpenAPI schema ready for Swagger/API documentation
```

## 📦 Installation

```bash
# Using npm
npm install ts-class-to-openapi

# Using yarn
yarn add ts-class-to-openapi

# Using pnpm
pnpm add ts-class-to-openapi
```

### Additional Dependencies for class-validator

To use validation decorators and generate more detailed schemas:

```bash
npm install ts-class-to-openapi class-validator
```

> **Note**: The `class-validator` dependency is optional and only required when using validation decorators.

## 🎨 Class Transformation Examples

### 1. Basic TypeScript Class

Fundamental method: transform any TypeScript class without decorators:

```typescript
import { transform } from 'ts-class-to-openapi'

// Basic TypeScript class - no decorators required
class User {
  id: number
  name: string
  email: string
  age: number
  active: boolean
  tags: string[]
  createdAt: Date
}

// Transform class to OpenAPI schema
const result = transform(User)
console.log(JSON.stringify(result, null, 2))
```

**Generated output:**

```json
{
  "name": "User",
  "schema": {
    "type": "object",
    "properties": {
      "id": { "type": "number" },
      "name": { "type": "string" },
      "email": { "type": "string" },
      "age": { "type": "number" },
      "active": { "type": "boolean" },
      "tags": {
        "type": "array",
        "items": { "type": "string" }
      },
      "createdAt": {
        "type": "string",
        "format": "date-time"
      }
    },
    "required": ["id", "name", "email", "age", "active", "tags", "createdAt"]
  }
}
```

### 2. Class with Advanced Validations

For more detailed schemas, class-validator decorators can be incorporated:

```typescript
import { transform } from 'ts-class-to-openapi'
import { IsString, IsEmail, IsNotEmpty, IsInt, Min, Max } from 'class-validator'

// Class with validation decorators
class User {
  @IsString()
  @IsNotEmpty()
  name: string

  @IsEmail()
  email: string

  @IsInt()
  @Min(18)
  @Max(100)
  age: number
}

const result = transform(User)
```

**Generated output:**

```json
{
  "name": "User",
  "schema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "email": {
        "type": "string",
        "format": "email"
      },
      "age": {
        "type": "integer",
        "format": "int32",
        "minimum": 18,
        "maximum": 100
      }
    },
    "required": ["name", "email", "age"]
  }
}
```

### 3. Nested Objects and Arrays

Automatic processing of complex relationships:

```typescript
import { transform } from 'ts-class-to-openapi'

class Address {
  street: string
  city: string
  zipCode: string
}

class Role {
  id: number
  name: string
  permissions: string[]
}

class User {
  id: number
  name: string
  email: string
  address: Address // Nested object
  roles: Role[] // Array of objects
  phone?: string // Optional property
}

const schema = transform(User)
```

**Generated output:**

```json
{
  "name": "User",
  "schema": {
    "type": "object",
    "properties": {
      "id": { "type": "number" },
      "name": { "type": "string" },
      "email": { "type": "string" },
      "address": {
        "type": "object",
        "properties": {
          "street": { "type": "string" },
          "city": { "type": "string" },
          "zipCode": { "type": "string" }
        },
        "required": ["street", "city", "zipCode"]
      },
      "roles": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": { "type": "number" },
            "name": { "type": "string" },
            "permissions": {
              "type": "array",
              "items": { "type": "string" }
            }
          },
          "required": ["id", "name", "permissions"]
        }
      },
      "phone": { "type": "string" }
    },
    "required": ["id", "name", "email", "address", "roles"]
  }
}
```

### 4. Enumerations and Special Types

Full compatibility with TypeScript enumerations (both decorated and pure):

```typescript
import { transform } from 'ts-class-to-openapi'
import { IsEnum } from 'class-validator'

enum UserType {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
}

enum Priority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
}

class Task {
  @IsEnum(UserType)
  assignedTo: UserType

  // Pure TypeScript enum (automatically detected without decorator)
  status: UserType

  @IsEnum(Priority)
  priority?: Priority

  title: string
  completed: boolean
  dueDate: Date
}

const schema = transform(Task)
```

**Generated output:**

```json
{
  "name": "Task",
  "schema": {
    "type": "object",
    "properties": {
      "assignedTo": {
        "type": "string",
        "enum": ["admin", "user", "moderator"]
      },
      "status": {
        "type": "string",
        "enum": ["admin", "user", "moderator"]
      },
      "priority": {
        "type": "number",
        "enum": [1, 2, 3]
      },
      "title": { "type": "string" },
      "completed": { "type": "boolean" },
      "dueDate": {
        "type": "string",
        "format": "date-time"
      }
    },
    "required": ["assignedTo", "status", "title", "completed", "dueDate"]
  }
}
```

### 5. File Upload

Integrated support for binary file handling:

```typescript
import { transform } from 'ts-class-to-openapi'
import { IsNotEmpty, IsOptional } from 'class-validator'

// Custom file type definition
class UploadFile {}

class UserProfile {
  @IsNotEmpty()
  profilePicture: UploadFile

  @IsOptional()
  resume: UploadFile

  documents: UploadFile[] // Multiple files
}

const schema = transform(UserProfile)
```

**Generated output:**

```json
{
  "name": "UserProfile",
  "schema": {
    "type": "object",
    "properties": {
      "profilePicture": {
        "type": "string",
        "format": "binary"
      },
      "resume": {
        "type": "string",
        "format": "binary"
      },
      "documents": {
        "type": "array",
        "items": {
          "type": "string",
          "format": "binary"
        }
      }
    },
    "required": ["profilePicture", "documents"]
  }
}
```

## 🌐 REST API Integration

### Implementation with Express.js and Swagger UI

```typescript
import express from 'express'
import swaggerUi from 'swagger-ui-express'
import { transform } from 'ts-class-to-openapi'
import { IsString, IsEmail, IsNotEmpty, IsInt, Min, Max } from 'class-validator'

// DTO definition with validation decorators
class User {
  @IsString()
  @IsNotEmpty()
  name: string

  @IsEmail()
  email: string

  @IsInt()
  @Min(18)
  @Max(100)
  age: number
}

class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string

  @IsEmail()
  email: string
}

const app = express()

// Schema generation from classes
const userSchema = transform(User)
const createUserSchema = transform(CreateUserDto)

// OpenAPI specification configuration
const swaggerSpecification = {
  openapi: '3.1.0',
  info: { title: 'Management API', version: '1.0.0' },
  components: {
    schemas: {
      [userSchema.name]: userSchema.schema,
      [createUserSchema.name]: createUserSchema.schema,
    },
  },
}

// Swagger UI configuration
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecification))

app.listen(3000, () => {
  console.log('API documentation available at http://localhost:3000/api-docs')
})
```

### Complete POST endpoint implementation with schema validation

```typescript
import express from 'express'
import swaggerUi from 'swagger-ui-express'
import { transform } from 'ts-class-to-openapi'
import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsOptional,
} from 'class-validator'

// Domain entity definition
class User {
  @IsInt()
  @Min(1)
  id: number

  @IsString()
  @IsNotEmpty()
  name: string

  @IsEmail()
  email: string

  @IsInt()
  @Min(18)
  @Max(100)
  age: number

  @IsOptional()
  @IsString()
  phone?: string
}

// DTO for user creation
class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string

  @IsEmail()
  email: string

  @IsInt()
  @Min(18)
  @Max(100)
  age: number

  @IsOptional()
  @IsString()
  phone?: string
}

const app = express()
app.use(express.json())

// Schema generation from classes
const userSchema = transform(User)
const createUserSchema = transform(CreateUserDto)

// Complete OpenAPI specification with POST endpoint
const swaggerSpecification = {
  openapi: '3.1.0',
  info: { title: 'User Management API', version: '1.0.0' },
  components: {
    schemas: {
      [userSchema.name]: userSchema.schema,
      [createUserSchema.name]: createUserSchema.schema,
      UserResponse: {
        type: 'object',
        properties: {
          data: { $ref: `#/components/schemas/${userSchema.name}` },
          success: { type: 'boolean' },
        },
        required: ['data', 'success'],
      },
    },
  },
  paths: {
    '/users': {
      post: {
        summary: 'Create a new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: `#/components/schemas/${createUserSchema.name}`,
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'User created successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserResponse' },
              },
            },
          },
          '400': {
            description: 'Invalid input data',
          },
        },
      },
    },
  },
}

// POST endpoint implementation
app.post('/users', (req, res) => {
  try {
    const userData = req.body as CreateUserDto

    // User creation simulation (replace with database logic)
    const newUser: User = {
      id: Math.floor(Math.random() * 1000) + 1,
      ...userData,
    }

    // Response that complies with the defined schema
    const response = {
      data: newUser,
      success: true,
    }

    res.status(201).json(response)
  } catch (error) {
    res.status(400).json({
      data: null,
      success: false,
      error: 'Invalid input data',
    })
  }
})

// Swagger UI configuration
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecification))

app.listen(3000, () => {
  console.log('API documentation available at http://localhost:3000/api-docs')
})
```

## 📖 API Reference

### `transform(class: Function)`

Transforms a class constructor function into an OpenAPI schema object.

**Parameters:**

- `class: Function` - The class constructor function to transform

**Returns:**

```typescript
{
  name: string;        // Class name
  schema: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
  }
}
```

**Example:**

```typescript
import { transform } from 'ts-class-to-openapi'
import { User } from './entities/user.js'

const result = transform(User)
console.log(result.name) // "User"
console.log(result.schema) // OpenAPI schema object
```

## 🎯 Required Properties Rules

### TypeScript Optional Operator (`?`)

The presence or absence of the TypeScript optional operator (`?`) determines whether a property is required:

```typescript
class User {
  name: string // ✅ REQUIRED (no ? operator)
  email: string // ✅ REQUIRED (no ? operator)
  age?: number // ❌ OPTIONAL (has ? operator)
  bio?: string // ❌ OPTIONAL (has ? operator)
}

// Generated schema:
// "required": ["name", "email"]
```

### Override via class-validator Decorators

class-validator decorators can override the default behavior of the TypeScript optional operator:

```typescript
import { IsNotEmpty, IsOptional } from 'class-validator'

class User {
  @IsNotEmpty()
  requiredField?: string // ✅ REQUIRED (@IsNotEmpty overrides ?)

  @IsOptional()
  optionalField: string // ❌ OPTIONAL (@IsOptional overrides absence of ?)

  normalField: string // ✅ REQUIRED (no ? operator)
  normalOptional?: string // ❌ OPTIONAL (has ? operator)
}

// Generated schema:
// "required": ["requiredField", "normalField"]
```

## 🎨 Supported Decorators

### Type Validation Decorators

| Decorator             | Generated Schema Property                       | Description                |
| --------------------- | ----------------------------------------------- | -------------------------- |
| `@IsString()`         | `type: "string"`                                | String type validation     |
| `@IsInt()`            | `type: "integer", format: "int32"`              | Integer type validation    |
| `@IsNumber()`         | `type: "number", format: "double"`              | Number type validation     |
| `@IsBoolean()`        | `type: "boolean"`                               | Boolean type validation    |
| `@IsEmail()`          | `type: "string", format: "email"`               | Email format validation    |
| `@IsDate()`           | `type: "string", format: "date-time"`           | Date format validation     |
| `@IsEnum(enumObject)` | `type: "string/number/boolean", enum: [values]` | Enum constraint validation |

### String Validation Decorators

| Decorator           | Generated Schema Property        | Description           |
| ------------------- | -------------------------------- | --------------------- |
| `@IsNotEmpty()`     | Added to `required` array        | Field is required     |
| `@MinLength(n)`     | `minLength: n`                   | Minimum string length |
| `@MaxLength(n)`     | `maxLength: n`                   | Maximum string length |
| `@Length(min, max)` | `minLength: min, maxLength: max` | String length range   |

### Number Validation Decorators

| Decorator       | Generated Schema Property | Description           |
| --------------- | ------------------------- | --------------------- |
| `@Min(n)`       | `minimum: n`              | Minimum numeric value |
| `@Max(n)`       | `maximum: n`              | Maximum numeric value |
| `@IsPositive()` | `minimum: 0`              | Positive number (≥ 0) |

### Array Validation Decorators

| Decorator          | Generated Schema Property | Description                 |
| ------------------ | ------------------------- | --------------------------- |
| `@IsArray()`       | `type: "array"`           | Array type validation       |
| `@ArrayNotEmpty()` | `minItems: 1` + required  | Non-empty array requirement |
| `@ArrayMinSize(n)` | `minItems: n`             | Minimum array size          |
| `@ArrayMaxSize(n)` | `maxItems: n`             | Maximum array size          |

## 📊 Comparison: Pure TypeScript vs Enhanced Mode

| Feature                | Pure TypeScript                       | Enhanced (class-validator)           |
| ---------------------- | ------------------------------------- | ------------------------------------ |
| **Dependencies**       | Zero                                  | Requires `class-validator`           |
| **Configuration**      | None                                  | `experimentalDecorators: true`       |
| **Type Detection**     | Automatic                             | Automatic + Decorators               |
| **Validation Rules**   | Basic types only                      | Rich validation constraints          |
| **Required Fields**    | Based on optional operator (`?`)      | Optional operator + decorators       |
| **String Constraints** | None                                  | Min/max length, patterns             |
| **Number Constraints** | None                                  | Min/max values, positive             |
| **Array Constraints**  | None                                  | Min/max items, non-empty             |
| **Use Case**           | Existing codebases, rapid prototyping | APIs with validation, robust schemas |

## ⚙️ Configuration

### Requirements

- Node.js >= 14.0.0
- TypeScript with minimal compiler options in `tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "experimentalDecorators": true
    }
  }
  ```

> **Note**: The `experimentalDecorators` option is only required if you plan to use class-validator decorators. Pure TypeScript classes work without special configuration.

### TypeScript Support

This library works with:

- ✅ Pure TypeScript classes (no decorators needed)
- ✅ class-validator decorated classes
- ✅ Mixed usage (some classes with decorators, some without)
- ✅ All TypeScript types: primitives, arrays, enums, nested objects

### Module Compatibility

This library is **fully compatible with CommonJS and ESM**:

```typescript
// ESM (recommended)
import { transform } from 'ts-class-to-openapi'

// CommonJS
const { transform } = require('ts-class-to-openapi')
```

## 🔧 Troubleshooting

### Common Issues

**Error: "Cannot find module 'ts-class-to-openapi'"**

```bash
npm install ts-class-to-openapi
```

**Error: "Cannot find module 'class-validator'"**

This dependency is only necessary for using validation decorators:

```bash
npm install class-validator
```

**Error: "Experimental decorators warning"**

Add the following configuration to the `tsconfig.json` file:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

**Empty schema generated**

- For pure TypeScript classes: Verify that the class contains properties with correctly defined types
- For classes with decorators: Confirm that the class includes class-validator decorators
- Verify that the class is correctly exported and imported
- Confirm that TypeScript compilation runs without errors

**Works without decorators but wants validation?**

Pure TypeScript classes work immediately, but if you want enhanced validation schemas:

1. Install class-validator: `npm install class-validator`
2. Add decorators to the corresponding properties
3. Enable `experimentalDecorators: true` in the tsconfig.json file

## 🌟 Advanced Features

- ✅ **Native pure TypeScript support** - Compatible with any TypeScript class without requiring decorators
- ✅ **Zero runtime dependencies** - Uses TypeScript Compiler API instead of reflect-metadata
- ✅ **Optimized performance** - Singleton pattern implementation with caching system for repeated transformations
- ✅ **Nested object processing** - Automatic handling of complex relationships between objects
- ✅ **Full typed array support** - Comprehensive compatibility with arrays and validation constraints
- ✅ **Integrated caching system** - Avoids reprocessing the same classes
- ✅ **Type safety** - Complete TypeScript support with precise type definitions
- ✅ **Framework agnostic** - Compatible with any TypeScript project configuration

## 🔄 Migration Guide

### Migration from reflect-metadata Based Solutions

For projects using solutions that require `reflect-metadata`:

**Previous implementation (with reflect-metadata):**

```typescript
import 'reflect-metadata'
import { getMetadataStorage } from 'class-validator'

// Complex configuration required
const schema = transformClassToSchema(User)
```

**New implementation (with ts-class-to-openapi):**

```typescript
import { transform } from 'ts-class-to-openapi'

// Simplified API
const schema = transform(User)
```

### New Functionality: Pure TypeScript Support

The main advantage lies in the ability to transform **any TypeScript class** without requiring decorators:

**Previous limitation (mandatory decorators):**

```typescript
// This approach would NOT work with traditional solutions
class LegacyUser {
  id: number
  name: string
  email: string
}
```

**Current implementation (immediate functionality):**

```typescript
import { transform } from 'ts-class-to-openapi'

// Ready-to-use functionality
class LegacyUser {
  id: number
  name: string
  email: string
}

const schema = transform(LegacyUser) // ✅ Successful operation
```

## 📄 License

MIT
