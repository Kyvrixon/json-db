# 🗄️ JSON Database

A high-performance, file-based JSON database for TypeScript with advanced querying, schema validation, and memory-safe operations.

## ✨ Features

- 🚀 **High Performance**: Map-based operations for optimal speed
- 🔒 **Memory-Safe Locking**: Thread-safe operations without filesystem artifacts
- 🎯 **Advanced Filtering**: MongoDB-style query operators (`$and`, `$or`, `$not`, `$exists`, `$regex`, `$in`, `$arraySize`)
- 📋 **Schema Validation**: Built-in Zod integration for type safety
- ⚡ **Batch Operations**: Efficient bulk read/write/delete operations
- 🔄 **Atomic Writes**: Crash-safe operations with temporary file swapping
- 📁 **Collection-Based**: Organize data in collections (folders) with documents (JSON files)
- 🛡️ **Type Safety**: Full TypeScript support with generics

## 📦 Installation

> [!TIP]
> Also works with other package managers!

```bash
bun add @kyvrixon/json-db
```

## 🚀 Quick Start

```typescript
import { Database } from '@kyvrixon/json-db';
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

// Create a user
await db.write('users', 'john', {
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  tags: ['developer', 'typescript']
}, UserSchema);

// Read a user
const user = await db.read<User>('users', 'john');
console.log(user); // { name: 'John Doe', email: 'john@example.com', ... }

// Find users with advanced filtering
const developers = await db.find('users', {
  tags: { $in: ['developer'] },
  age: { $greaterThanOrEqual: 25 }
});

console.log(developers); // Map<string, User>
```

## 📖 API Reference

### Basic Operations

#### `write(collection, id, data, schema?)`

Write a document to a collection with optional schema validation.

```typescript
await db.write('users', 'user1', { name: 'Alice', age: 25 });
```

#### `read(collection, id, schema?)`

Read a single document by ID.

```typescript
const user = await db.read('users', 'user1');
```

#### `readAll(collection, schema?)`

Read all documents in a collection. Returns a `Map<string, T>`.

```typescript
const allUsers = await db.readAll('users');
```

#### `delete(collection, id)`

Delete a single document.

```typescript
const deleted = await db.delete('users', 'user1'); // Returns boolean
```

### Advanced Querying

#### `find(collection, filter, schema?)`

Find documents with advanced filtering. Returns a `Map<string, T>`.

```typescript
const adults = await db.find('users', {
  age: { $greaterThanOrEqual: 18 }
});

const developers = await db.find('users', {
  $and: [
    { tags: { $in: ['developer'] } },
    { age: { $lessThan: 40 } }
  ]
});
```

#### `findOne(collection, filter, schema?)`

Find the first document matching a filter.

```typescript
const firstAdmin = await db.findOne('users', {
  role: { $equals: 'admin' }
});
// Returns: { id: string, data: T } | null
```

#### `count(collection)` / `countFiltered(collection, filter)`

Count documents in a collection.

```typescript
const totalUsers = await db.count('users');
const activeUsers = await db.countFiltered('users', { 
  status: { $equals: 'active' } 
});
```

### Batch Operations

#### `batchWrite(operations)`

Perform multiple write/delete operations efficiently.

```typescript
await db.batchWrite([
  { type: 'write', collection: 'users', id: 'user1', data: userData1 },
  { type: 'write', collection: 'users', id: 'user2', data: userData2 },
  { type: 'delete', collection: 'users', id: 'user3' }
]);
```

#### `batchRead(operations)`

Perform multiple read operations.

```typescript
const results = await db.batchRead([
  { collection: 'users', id: 'user1' },
  { collection: 'users', filter: { age: { $greaterThan: 30 } } }
]);
```

### Bulk Operations

#### `writeMany(collection, documents, schema?)`

Write multiple documents at once.

```typescript
await db.writeMany('users', {
  'user1': { name: 'John', age: 30 },
  'user2': { name: 'Jane', age: 25 }
});
```

#### `deleteMany(collection, ids)` / `deleteManyFiltered(collection, filter)`

Delete multiple documents.

```typescript
await db.deleteMany('users', ['user1', 'user2']);
await db.deleteManyFiltered('users', { age: { $lessThan: 18 } });
```

### Collection Management

#### `listCollections()`

List all collections in the database.

```typescript
const collections = await db.listCollections();
```

#### `dropCollection(collection)` / `dropCollectionFiltered(collection, filter)`

Delete entire collections or filtered subsets.

```typescript
await db.dropCollection('temp_data');
await db.dropCollectionFiltered('users', { status: { $equals: 'inactive' } });
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

## 🏗️ Database Structure

```text
./data/
├── users/
│   ├── user1.json
│   ├── user2.json
│   └── user3.json
├── posts/
│   ├── post1.json
│   └── post2.json
└── settings/
    └── config.json
```

Each collection is a folder, and each document is a JSON file named by its ID.

## 🛡️ Type Safety

The database is fully typed with TypeScript generics:

```typescript
interface User {
  name: string;
  email: string;
  age: number;
}

// Typed operations
const user = await db.read<User>('users', 'user1');
const users = await db.find<User>('users', { age: { $greaterThan: 18 } });
```

## 📄 License

MIT
