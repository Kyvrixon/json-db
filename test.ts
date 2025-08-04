import Database from './src/lib/json-db';
import { z } from 'zod';

const db = new Database('./test-db', { validateOnRead: true });

const userSchema = z.object({
  name: z.string(),
  age: z.number(),
  tags: z.array(z.string()).optional()
});

function time(label: string) {
  const start = process.hrtime.bigint();
  return {
    end: () => {
      const end = process.hrtime.bigint();
      const ms = Number(end - start) / 1e6;
      console.log(`${label}: ${ms.toFixed(2)}ms`);
    }
  };
}

async function runTests() {
  // Clean up test dir
  const t0 = time('dropCollection');
  await db.dropCollection('users');
  t0.end();

  // Write single document
  const t1 = time('write');
  await db.write('users', '1', { name: 'Alice', age: 30, tags: ['admin'] }, userSchema);
  t1.end();

  // Read single document
  const t2 = time('read');
  const user1 = await db.read('users', '1', userSchema);
  t2.end();
  console.log('Read user:', user1);

  // Write many documents
  const users = {
    '2': { name: 'Bob', age: 25 },
    '3': { name: 'Charlie', age: 35, tags: ['editor'] },
    '4': { name: 'Dana', age: 28 }
  };
  const t3 = time('writeMany');
  await db.writeMany('users', users, userSchema);
  t3.end();

  // Read all documents
  const t4 = time('readAll');
  const allUsers = await db.readAll('users', userSchema);
  t4.end();
  console.log('All users:', allUsers);

  // Find documents (age > 27)
  const t5 = time('find');
  const found = await db.find('users', { age: { $greaterThan: 27 } }, userSchema);
  t5.end();
  console.log('Found users age > 27:', found);

  // Find one document (name === 'Bob')
  const t6 = time('findOne');
  const foundOne = await db.findOne('users', { name: { $equals: 'Bob' } }, userSchema);
  t6.end();
  console.log('Found one:', foundOne);

  // Batch write (update and delete)
  const t7 = time('batchWrite');
  const batchWriteRes = await db.batchWrite([
    { type: 'write', collection: 'users', id: '2', data: { name: 'Bob', age: 26 } },
    { type: 'delete', collection: 'users', id: '4' }
  ]);
  t7.end();
  console.log('Batch write result:', batchWriteRes);

  // Batch read
  const t8 = time('batchRead');
  const batchReadRes = await db.batchRead([
    { collection: 'users', id: '2' },
    { collection: 'users', filter: { age: { $greaterThanOrEqual: 30 } } },
    { collection: 'users' }
  ]);
  t8.end();
  console.log('Batch read result:', batchReadRes);

  // Delete single document
  const t9 = time('delete');
  const delRes = await db.delete('users', '3');
  t9.end();
  console.log('Delete result:', delRes);

  // Delete many documents
  const t10 = time('deleteMany');
  const delManyRes = await db.deleteMany('users', ['1', '2']);
  t10.end();
  console.log('DeleteMany result:', delManyRes);

  // Count documents
  const t11 = time('count');
  const count = await db.count('users');
  t11.end();
  console.log('Count:', count);

  // List collections
  const t12 = time('listCollections');
  const collections = await db.listCollections();
  t12.end();
  console.log('Collections:', collections);

  // Test new filtering methods
  console.log('\n--- Testing Filter Methods ---');
  
  // Add some test data back for filtering tests
  await db.write('users', '1', { name: 'Alice', age: 30, tags: ['admin'] });
  await db.write('users', '2', { name: 'Bob', age: 25, tags: ['user'] });
  await db.write('users', '3', { name: 'Charlie', age: 35, tags: ['editor', 'admin'] });
  await db.write('users', '4', { name: 'Dana', age: 28, tags: ['user'] });
  await db.write('users', '5', { name: 'Eve', age: 32, tags: ['moderator'] });

  // Test readAllFiltered
  const t13 = time('readAllFiltered');
  const filteredUsers = await db.readAllFiltered('users', { age: { $greaterThan: 27 } });
  t13.end();
  console.log('Filtered users (age > 27):', filteredUsers);

  // Test countFiltered
  const t14 = time('countFiltered');
  const filteredCount = await db.countFiltered('users', { tags: { $in: ['admin'] } });
  t14.end();
  console.log('Count users with admin tag:', filteredCount);

  // Test deleteManyFiltered
  const t15 = time('deleteManyFiltered');
  const deletedFiltered = await db.deleteManyFiltered('users', { age: { $lessThan: 27 } });
  t15.end();
  console.log('Deleted users with age < 27:', deletedFiltered);

  // Test dropCollectionFiltered
  const t16 = time('dropCollectionFiltered');
  const droppedFiltered = await db.dropCollectionFiltered('users', { tags: { $in: ['moderator'] } });
  t16.end();
  console.log('Dropped users with moderator tag:', droppedFiltered);

  // Test complex filters
  console.log('\n--- Testing Complex Filters ---');
  
  // Re-add test data
  await db.writeMany('users', {
    '1': { name: 'Alice', age: 30, tags: ['admin', 'developer'] },
    '2': { name: 'Bob', age: 25, tags: ['user'] },
    '3': { name: 'Charlie', age: 35, tags: ['editor'] },
    '4': { name: 'Dana', age: 28, tags: ['user', 'tester'] },
    '5': { name: 'Eve', age: 32 } // No tags
  });

  // Test $and operator
  const t17 = time('find with $and');
  const andResult = await db.find('users', {
    $and: [
      { age: { $greaterThan: 25 } },
      { age: { $lessThan: 35 } }
    ]
  });
  t17.end();
  console.log('Users with age between 25 and 35:', andResult);

  // Test $or operator
  const t18 = time('find with $or');
  const orResult = await db.find('users', {
    $or: [
      { name: { $equals: 'Alice' } },
      { age: { $greaterThan: 33 } }
    ]
  });
  t18.end();
  console.log('Users named Alice OR age > 33:', orResult);

  // Test $not operator
  const t19 = time('find with $not');
  const notResult = await db.find('users', {
    $not: { age: { $lessThan: 30 } }
  });
  t19.end();
  console.log('Users NOT with age < 30:', notResult);

  // Test $exists operator
  const t20 = time('find with $exists');
  const existsResult = await db.find('users', { tags: { $exists: true } });
  t20.end();
  console.log('Users with tags field:', existsResult);

  // Test $regex operator
  const t21 = time('find with $regex');
  const regexResult = await db.find('users', { name: { $regex: /^[A-C]/ } });
  t21.end();
  console.log('Users with names starting A-C:', regexResult);

  // Test $arraySize operator
  const t22 = time('find with $arraySize');
  const arraySizeResult = await db.find('users', { tags: { $arraySize: 2 } });
  t22.end();
  console.log('Users with exactly 2 tags:', arraySizeResult);

  // Test $notIn operator
  const t23 = time('find with $notIn');
  const notInResult = await db.find('users', { name: { $notIn: ['Bob', 'Eve'] } });
  t23.end();
  console.log('Users NOT named Bob or Eve:', notInResult);

  // Test schema validation
  console.log('\n--- Testing Schema Validation ---');
  
  const t24 = time('schema validation success');
  try {
    await db.write('users', 'valid', { name: 'Valid User', age: 25, tags: ['test'] }, userSchema);
    console.log('Schema validation passed');
  } catch (error) {
    console.log('Schema validation failed:', error);
  }
  t24.end();

  const t25 = time('schema validation failure');
  try {
    await db.write('users', 'invalid', { name: 'Invalid User', age: 'not a number' } as any, userSchema);
    console.log('Schema validation incorrectly passed');
  } catch (error) {
    console.log('Schema validation correctly failed:', error.message);
  }
  t25.end();

  // Test validate method directly
  const t26 = time('validate method');
  try {
    const validatedData = await db.validate({ name: 'Test', age: 30 }, userSchema);
    console.log('Direct validation passed:', validatedData);
  } catch (error) {
    console.log('Direct validation failed:', error.message);
  }
  t26.end();

  // Test edge cases
  console.log('\n--- Testing Edge Cases ---');
  
  // Test empty collection operations
  await db.dropCollection('empty-collection');
  
  const t27 = time('operations on empty collection');
  const emptyRead = await db.readAll('empty-collection');
  const emptyCount = await db.count('empty-collection');
  const emptyFind = await db.find('empty-collection', { name: 'test' });
  const emptyDelete = await db.delete('empty-collection', 'nonexistent');
  t27.end();
  console.log('Empty collection results:', { emptyRead, emptyCount, emptyFind, emptyDelete });

  // Test nonexistent document operations
  const t28 = time('nonexistent document operations');
  const nonexistentRead = await db.read('users', 'nonexistent');
  const nonexistentDelete = await db.delete('users', 'nonexistent');
  t28.end();
  console.log('Nonexistent document results:', { nonexistentRead, nonexistentDelete });

  // Test concurrent operations (basic test)
  console.log('\n--- Testing Concurrent Operations ---');
  
  const t29 = time('concurrent writes');
  const concurrentPromises: Promise<void>[] = [];
  for (let i = 0; i < 10; i++) {
    concurrentPromises.push(
      db.write('concurrent', `user${i}`, { name: `User${i}`, age: 20 + i })
    );
  }
  await Promise.all(concurrentPromises);
  t29.end();
  
  const concurrentCount = await db.count('concurrent');
  console.log('Concurrent writes completed, count:', concurrentCount);

  // Count files
  const t30 = time('countFiles');
  const fileCount = await db.countFiles();
  t30.end();
  console.log('File count:', fileCount);

  // Final cleanup
  const t31 = time('final cleanup');
  await db.dropCollection('users');
  await db.dropCollection('concurrent');
  await db.dropCollection('empty-collection');
  t31.end();
  console.log('Final cleanup completed');
}

runTests().catch(e => {
  console.error('Test error:', e);
});
