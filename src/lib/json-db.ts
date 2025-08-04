import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Database configuration options.
 */
export interface DatabaseOptions {
  /**
   * Create directory if it does not exist.
   */
  createDirectory?: boolean;
  /**
   * Enable or disable validation of data on read operations.
   */
  validateOnRead?: boolean;
}

/**
 * Represents a set of query operators for filtering data.
 *
 * @template T - The type of the value being queried.
 */
export interface QueryOperators<T = any> {
  /**
   * Matches values that are equal to the specified value.
   */
  $equals?: T;
  /**
   * Matches values that are not equal to the specified value.
   */
  $notEquals?: T;
  /**
   * Matches values that are greater than the specified value.
   */
  $greaterThan?: T;
  /**
   * Matches values that are greater than or equal to the specified value.
   */
  $greaterThanOrEqual?: T;
  /**
   * Matches values that are less than the specified value.
   */
  $lessThan?: T;
  /**
   * Matches values that are less than or equal to the specified value.
   */
  $lessThanOrEqual?: T;
  /**
   * Matches values that are included in the specified array.
   */
  $in?: T extends any[] ? T[number][] : T[];
  /**
   * Matches values that are not included in the specified array.
   */
  $notIn?: T extends any[] ? T[number][] : T[];
  /**
   * Checks if the value exists (true) or does not exist (false).
   */
  $exists?: boolean;
  /**
   * Matches string values using the specified regular expression.
   */
  $regex?: RegExp;
  /**
   * Matches arrays with the specified number of elements.
   */
  $arraySize?: number;
}

export type DatabaseFilter<T> = {
  [K in keyof T]?: T[K] | QueryOperators<T[K]>;
} & {
  $and?: DatabaseFilter<T>[];
  $or?: DatabaseFilter<T>[];
  $not?: DatabaseFilter<T>;
};

export interface BatchWriteOperation<T = any> {
  type: 'write' | 'delete';
  collection: string;
  id?: string;
  data?: T;
}

export interface BatchReadOperation {
  collection: string;
  id?: string;
  filter?: DatabaseFilter<any>;
}

export interface BatchResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export class Database {
  private basePath: string;
  private options: DatabaseOptions;
  private lockedFiles: Set<string> = new Set();

  constructor(basePath: string, options: DatabaseOptions = {}) {
    this.basePath = path.resolve(basePath);
    this.options = {
      createDirectory: true,
      validateOnRead: false,
      ...options
    };
  }

  /**
   * Ensures a directory exists, creating it if necessary
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Gets the full file path for a collection
   */
  private getCollectionDir(collection: string): string {
    return path.join(this.basePath, collection);
  }

  /**
   * Acquires a memory-only lock for file operations
   */
  private async acquireLock(file?: string): Promise<void> {
    if (!file) return;
    let attempts = 0;
    const maxAttempts = 100;
    const lockDelay = 10;
    while (attempts < maxAttempts) {
      if (!this.lockedFiles.has(file)) {
        this.lockedFiles.add(file);
        return;
      }
      attempts++;
      await new Promise(resolve => setTimeout(resolve, lockDelay));
    }
    throw new Error('Could not acquire memory lock for file: ' + file);
  }

  /**
   * Releases a memory-only lock for file operations
   */
  private async releaseLock(file?: string): Promise<void> {
    if (!file) return;
    this.lockedFiles.delete(file);
  }

  /**
   * Reads and parses a JSON file safely
   */
  private async readJSONFile<T = any>(filePath: string, schema?: z.ZodSchema<T>): Promise<T> {
    try {
      await fs.access(filePath);
    } catch {
      return null as T;
    }
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    if (schema && this.options.validateOnRead) {
      return schema.parse(data);
    }
    return data;
  }

  /**
   * Writes data to a JSON file atomically (memory lock)
   */
  private async writeJSONFile<T = any>(filePath: string, data: T): Promise<void> {
    await this.acquireLock(filePath);
    try {
      await this.writeJSONFileUnsafe(filePath, data);
    } finally {
      await this.releaseLock(filePath);
    }
  }

  /**
   * Writes data to a JSON file without acquiring a lock (assumes lock is already held)
   */
  private async writeJSONFileUnsafe<T = any>(filePath: string, data: T): Promise<void> {
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempPath, filePath);
  }

  /**
   * Validates data against a Zod schema
   */
  async validate<T>(data: unknown, schema: z.ZodSchema<T>): Promise<T> {
    return schema.parse(data);
  }

  /**
   * Reads a single document from a collection
   */
  async read<T = any>(collection: string, id: string, schema?: z.ZodSchema<T>): Promise<T | null> {
    const dirPath = this.getCollectionDir(collection);
    const filePath = path.join(dirPath, `${id}.json`);
    return await this.readJSONFile(filePath, schema);
  }

  /**
   * Reads all documents from a collection
   */
  async readAll<T = any>(collection: string, schema?: z.ZodSchema<T>): Promise<Map<string, T>> {
    const dirPath = this.getCollectionDir(collection);
    try {
      await fs.access(dirPath);
    } catch {
      return new Map();
    }
    const files = (await fs.readdir(dirPath)).filter(f => f.endsWith('.json'));
    const result = new Map<string, T>();
    for (const file of files) {
      const id = path.basename(file, '.json');
      const data = await this.readJSONFile<T>(path.join(dirPath, file), schema);
      if (data !== null) result.set(id, data);
    }
    return result;
  }

  /**
   * Reads all documents from a collection, optionally filtered
   */
  async readAllFiltered<T = any>(collection: string, filter: DatabaseFilter<T> = {}, schema?: z.ZodSchema<T>): Promise<Map<string, T>> {
    const all = await this.readAll(collection, schema);
    if (!filter || Object.keys(filter).length === 0) return all;
    const result = new Map<string, T>();
    for (const [id, doc] of all.entries()) {
      if (this.matchesDocument(doc, filter)) result.set(id, doc);
    }
    return result;
  }

  /**
   * Writes a single document to a collection
   */
  async write<T = any>(collection: string, id: string, data: T, schema?: z.ZodSchema<T>): Promise<void> {
    const dirPath = this.getCollectionDir(collection);
    await this.ensureDirectoryExists(dirPath);
    if (schema) {
      schema.parse(data);
    }
    const filePath = path.join(dirPath, `${id}.json`);
    await this.writeJSONFile(filePath, data);
  }

  /**
   * Writes multiple documents to a collection
   */
  async writeMany<T = any>(collection: string, documents: Record<string, T>, schema?: z.ZodSchema<T>): Promise<void> {
    const dirPath = this.getCollectionDir(collection);
    await this.ensureDirectoryExists(dirPath);
    for (const [id, data] of Object.entries(documents)) {
      if (schema) {
        schema.parse(data);
      }
      const filePath = path.join(dirPath, `${id}.json`);
      await this.writeJSONFile(filePath, data);
    }
  }

  /**
   * Deletes a single document from a collection
   */
  async delete(collection: string, id: string): Promise<boolean> {
    const dirPath = this.getCollectionDir(collection);
    const filePath = path.join(dirPath, `${id}.json`);
    try {
      await fs.access(filePath);
    } catch {
      return false;
    }
    await this.acquireLock(filePath);
    try {
      await fs.unlink(filePath);
      return true;
    } finally {
      await this.releaseLock(filePath);
    }
  }

  /**
   * Deletes multiple documents from a collection
   */
  async deleteMany(collection: string, ids: string[]): Promise<number> {
    const dirPath = this.getCollectionDir(collection);
    let deletedCount = 0;
    for (const id of ids) {
      const filePath = path.join(dirPath, `${id}.json`);
      try {
        await fs.access(filePath);
      } catch {
        continue;
      }
      await this.acquireLock(filePath);
      try {
        await fs.unlink(filePath);
        deletedCount++;
      } finally {
        await this.releaseLock(filePath);
      }
    }
    return deletedCount;
  }

  /**
   * Deletes documents from a collection by filter
   */
  async deleteManyFiltered<T = any>(collection: string, filter: DatabaseFilter<T> = {}, schema?: z.ZodSchema<T>): Promise<number> {
    const all = await this.readAllFiltered(collection, filter, schema);
    return await this.deleteMany(collection, Array.from(all.keys()));
  }

  /**
   * Counts documents in a collection
   */
  async count(collection: string): Promise<number> {
    const dirPath = this.getCollectionDir(collection);
    try {
      await fs.access(dirPath);
    } catch {
      return 0;
    }
    return (await fs.readdir(dirPath)).filter(f => f.endsWith('.json')).length;
  }

  /**
   * Counts documents in a collection by filter
   */
  async countFiltered<T = any>(collection: string, filter: DatabaseFilter<T> = {}, schema?: z.ZodSchema<T>): Promise<number> {
    const all = await this.readAllFiltered(collection, filter, schema);
    return all.size;
  }

  /**
   * Counts files in the database directory
   */
  async countFiles(): Promise<number> {
    try {
      await fs.access(this.basePath);
    } catch {
      return 0;
    }
    let count = 0;
    const dirs = (await fs.readdir(this.basePath)).filter(async f => {
      const stat = await fs.stat(path.join(this.basePath, f));
      return stat.isDirectory();
    });
    for (const dir of dirs) {
      count += (await fs.readdir(path.join(this.basePath, dir))).filter(f => f.endsWith('.json')).length;
    }
    return count;
  }

  /**
   * Lists all collections (JSON files)
   */
  async listCollections(): Promise<string[]> {
    try {
      await fs.access(this.basePath);
    } catch {
      return [];
    };

    const entries = await fs.readdir(this.basePath);
    const result: string[] = [];
    for (const entry of entries) {
      const stat = await fs.stat(path.join(this.basePath, entry));
      if (stat.isDirectory()) result.push(entry);
    }
    return result;
  }

  /**
   * Checks if a value matches a filter condition
   */
  private matchesFilter<T>(value: T, filter: QueryOperators<T>): boolean {
    if (filter.$equals !== undefined) return value === filter.$equals;
    if (filter.$notEquals !== undefined) return value !== filter.$notEquals;
    if (filter.$greaterThan !== undefined && filter.$greaterThan !== null) return value > filter.$greaterThan;
    if (filter.$greaterThanOrEqual !== undefined && filter.$greaterThanOrEqual !== null) return value >= filter.$greaterThanOrEqual;
    if (filter.$lessThan !== undefined && filter.$lessThan !== null) return value < filter.$lessThan;
    if (filter.$lessThanOrEqual !== undefined && filter.$lessThanOrEqual !== null) return value <= filter.$lessThanOrEqual;

    if (filter.$in !== undefined) {
      if (Array.isArray(value)) {
        // For array values, check if any element in the value array matches any element in the filter array
        return value.some(item => filter.$in!.includes(item));
      } else {
        // For non-array values, check if the value is in the filter array
        return filter.$in.includes(value as any);
      }
    }

    if (filter.$notIn !== undefined) {
      if (Array.isArray(value)) {
        // For array values, check if no element in the value array matches any element in the filter array
        return !value.some(item => filter.$notIn!.includes(item));
      } else {
        // For non-array values, check if the value is not in the filter array
        return !filter.$notIn.includes(value as any);
      }
    }

    if (filter.$exists !== undefined) return (value !== undefined && value !== null) === filter.$exists;
    if (filter.$regex !== undefined && typeof value === 'string') return filter.$regex.test(value);
    if (filter.$arraySize !== undefined && Array.isArray(value)) return value.length === filter.$arraySize;

    return true;
  }

  /**
   * Checks if a document matches a database filter
   */
  private matchesDocument<T>(document: T, filter: DatabaseFilter<T>): boolean {
    // Handle logical operators
    if (filter.$and) {
      return filter.$and.every((f: DatabaseFilter<T>) => this.matchesDocument(document, f));
    }

    if (filter.$or) {
      return filter.$or.some((f: DatabaseFilter<T>) => this.matchesDocument(document, f));
    }

    if (filter.$not) {
      return !this.matchesDocument(document, filter.$not);
    }

    // Handle field filters
    for (const [key, value] of Object.entries(filter)) {
      if (key.startsWith('$')) continue; // Skip logical operators

      const documentValue = (document as any)[key];

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        if (!this.matchesFilter(documentValue, value as QueryOperators)) {
          return false;
        }
      } else {
        if (documentValue !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Finds documents matching a database filter
   */
  async find<T = any>(collection: string, filter: DatabaseFilter<T> = {}, schema?: z.ZodSchema<T>): Promise<Map<string, T>> {
    const allData = await this.readAll(collection, schema);
    const result = new Map<string, T>();
    for (const [id, document] of allData.entries()) {
      if (this.matchesDocument(document, filter)) {
        result.set(id, document);
      }
    }
    return result;
  }

  /**
   * Finds the first document matching a filter
   */
  async findOne<T = any>(collection: string, filter: DatabaseFilter<T> = {}, schema?: z.ZodSchema<T>): Promise<{ id: string; data: T } | null> {
    const allData = await this.readAll(collection, schema);
    for (const [id, document] of allData.entries()) {
      if (this.matchesDocument(document, filter)) {
        return { id, data: document };
      }
    }
    return null;
  }

  /**
   * Performs batch write operations (memory lock)
   */
  async batchWrite(operations: BatchWriteOperation[]): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    const operationsByCollection = new Map<string, BatchWriteOperation[]>();
    for (const op of operations) {
      if (!operationsByCollection.has(op.collection)) {
        operationsByCollection.set(op.collection, []);
      }
      operationsByCollection.get(op.collection)!.push(op);
    }
    for (const [collection, ops] of operationsByCollection) {
      const dirPath = this.getCollectionDir(collection);
      await this.ensureDirectoryExists(dirPath);
      for (const op of ops) {
        try {
          const filePath = path.join(dirPath, `${op.id}.json`);
          if (op.type === 'write' && op.id && op.data !== undefined) {
            await this.acquireLock(filePath);
            try {
              await this.writeJSONFileUnsafe(filePath, op.data);
              results.push({ success: true });
            } finally {
              await this.releaseLock(filePath);
            }
          } else if (op.type === 'delete' && op.id) {
            try {
              await fs.access(filePath);
            } catch {
              results.push({ success: false, error: 'Document not found' });
              continue;
            }
            await this.acquireLock(filePath);
            try {
              await fs.unlink(filePath);
              results.push({ success: true });
            } finally {
              await this.releaseLock(filePath);
            }
          } else {
            results.push({ success: false, error: 'Invalid operation' });
          }
        } catch (error) {
          results.push({ success: false, error: String(error) });
        }
      }
    }
    return results;
  }

  /**
   * Performs batch read operations
   */
  async batchRead(operations: BatchReadOperation[]): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    for (const op of operations) {
      try {
        if (op.id) {
          const data = await this.read(op.collection, op.id);
          results.push({ success: true, data });
        } else if (op.filter) {
          const data = await this.readAllFiltered(op.collection, op.filter);
          results.push({ success: true, data });
        } else {
          const data = await this.readAll(op.collection);
          results.push({ success: true, data });
        }
      } catch (error) {
        results.push({ success: false, error: String(error) });
      }
    }
    return results;
  }

  /**
   * Drops (deletes) an entire collection (memory lock)
   */
  async dropCollection(collection: string): Promise<boolean> {
    const dirPath = this.getCollectionDir(collection);
    try {
      await fs.access(dirPath);
    } catch {
      return false;
    }
    await this.acquireLock(dirPath);
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      return true;
    } finally {
      await this.releaseLock(dirPath);
    }
  }

  /**
   * Drops (deletes) documents in a collection by filter
   */
  async dropCollectionFiltered<T = any>(collection: string, filter: DatabaseFilter<T> = {}, schema?: z.ZodSchema<T>): Promise<number> {
    return await this.deleteManyFiltered(collection, filter, schema);
  }
}

export default Database;