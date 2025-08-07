# 🗄️ JSON Database

A high-performance, file-based JSON database for TypeScript with advanced querying, schema validation, and memory-safe operations.

## ✨ Features

- 🚀 **High Performance**: One-file-per-record for optimal speed
- 🔒 **Memory-Safe Locking**: Thread-safe operations without filesystem artifacts
- 🎯 **Advanced Filtering**: MongoDB-style query operators (`$and`, `$or`, `$not`, `$exists`, `$regex`, `$in`, `$arraySize`)
- 📋 **Schema Validation**: Built-in Zod integration for type safety
- 🔄 **Atomic Writes**: Crash-safe operations with temporary file swapping
- 📁 **Path-Based**: Organize data in directories and files, not just collections
- 🛡️ **Type Safety**: Full TypeScript support with generics
- 🗂️ **Directory Management**: Create and delete directories programmatically

## 📦 Installation

```bash
bun add @kyvrixon/json-db
```

## 🚀 Quick Start

```typescript
import Database from '@kyvrixon/json-db';
import { z } from 'zod';

// Initialize database
const db = new Database('./data');

// Define schema
const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number(),
  tags: z.array(z.string()).optional()
});

type User = z.infer<typeof UserSchema>;

// Create a user (writes to ./data/users/john.json)
await db.write('users/john', {
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  tags: ['developer', 'typescript']
}, UserSchema);

// Read a user
const user = await db.read<User>('users/john', UserSchema);
console.log(user); // { name: 'John Doe', email: 'john@example.com', ... }

// Find users with advanced filtering
const developers = await db.find('users', {
  tags: { $in: ['developer'] },
  age: { $greaterThanOrEqual: 25 }
}, UserSchema);

console.log(developers); // Map<string, User>

// Create a directory (e.g. for grouping)
await db.create('users/staff');

// Delete a user
await db.delete('users/john');

// Delete a whole directory (and all its contents)
await db.drop('users');
```

## 📖 API Reference

### Basic Operations

#### `write(filePath, data, schema?)`

Write a document to a path (e.g. `users/123`).

```typescript
await db.write('users/123', { name: 'Alice', age: 25 }, UserSchema);
```

#### `read(filePath, schema?)`

Read a single document by path.

```typescript
const user = await db.read('users/123', UserSchema);
```

#### `readAll(dirPath, schema?)`

Read all documents in a directory. Returns a `Map<string, T>`.

```typescript
const allUsers = await db.readAll('users', UserSchema);
```

#### `delete(filePath)`

Delete a single document by path.

```typescript
const deleted = await db.delete('users/123'); // Returns boolean
```

### Directory Management

#### `create(dirPath)`

Create an empty directory (and parents if needed).

```typescript
await db.create('users/staff');
```

#### `drop(dirPath)`

Delete a directory and all its contents.

```typescript
await db.drop('users');
```

### Advanced Querying

#### `find(dirPath, filter, schema?)`

Find documents with advanced filtering. Returns a `Map<string, T>`.

```typescript
const adults = await db.find('users', {
  age: { $greaterThanOrEqual: 18 }
}, UserSchema);

const developers = await db.find('users', {
  $and: [
    { tags: { $in: ['developer'] } },
    { age: { $lessThan: 40 } }
  ]
}, UserSchema);
```

#### `findOne(dirPath, filter, schema?)`

Find the first document matching a filter.

```typescript
const firstAdmin = await db.findOne('users', {
  role: { $equals: 'admin' }
}, UserSchema);
// Returns: { id: string, data: T } | null
```

## 🔍 Query Operators

Similar to `MongoDB`, but easier to understand.  

| Operator | Description | Example |
|----------|-------------|---------|
| `$equals` | Exact match | `{ age: { $equals: 25 } }` |
| `$notEquals` | Not equal | `{ status: { $notEquals: 'inactive' } }` |
| `$greaterThan` | Greater than | `{ age: { $greaterThan: 18 } }` |
| `$greaterThanOrEqual` | Greater than or equal | `{ age: { $greaterThanOrEqual: 21 } }` |
| `$lessThan` | Less than | `{ age: { $lessThan: 65 } }` |
| `$lessThanOrEqual` | Less than or equal | `{ age: { $lessThanOrEqual: 30 } }` |
| `$in` | Value in array | `{ role: { $in: ['admin', 'user'] } }` |
| `$notIn` | Value not in array | `{ status: { $notIn: ['banned', 'suspended'] } }` |
| `$exists` | Field exists | `{ email: { $exists: true } }` |
| `$regex` | Regular expression | `{ name: { $regex: /^John/ } }` |
| `$arraySize` | Array length | `{ tags: { $arraySize: 3 } }` |
| `$and` | Logical AND | `{ $and: [{ age: { $gt: 18 } }, { status: 'active' }] }` |
| `$or` | Logical OR | `{ $or: [{ role: 'admin' }, { role: 'moderator' }] }` |
| `$not` | Logical NOT | `{ $not: { status: 'inactive' } }` |

## ⚙️ Configuration

```typescript
const db = new Database('./data', {
  createDirectory: true,     // Auto-create database directory
  validateOnRead: false      // Validate data against schema on read
});
```

## 🛡️ Type Safety

The database is fully typed with TypeScript generics:

```typescript
interface User {
  name: string;
  email: string;
  age: number;
}

// Typed operations
const user = await db.read<User>('users/123');
const users = await db.find<User>('users', { age: { $greaterThan: 18 } });
```

## 📄 License

MIT
