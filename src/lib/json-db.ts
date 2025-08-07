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
 * All operators are properly typed to match the field type T.
 *
 * @template T - The type of the value being queried.
 */
export interface QueryOperators<T> {
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
   * Only available for number, string, and Date types.
   */
  $greaterThan?: T extends number | string | Date ? T : never;
  /**
   * Matches values that are greater than or equal to the specified value.
   * Only available for number, string, and Date types.
   */
  $greaterThanOrEqual?: T extends number | string | Date ? T : never;
  /**
   * Matches values that are less than the specified value.
   * Only available for number, string, and Date types.
   */
  $lessThan?: T extends number | string | Date ? T : never;
  /**
   * Matches values that are less than or equal to the specified value.
   * Only available for number, string, and Date types.
   */
  $lessThanOrEqual?: T extends number | string | Date ? T : never;
  /**
   * Matches values that are included in the specified array.
   * For array fields, matches if any element is in the provided array.
   * For non-array fields, matches if the value is in the provided array.
   */
  $in?: T extends readonly (infer U)[] ? U[] : T[];
  /**
   * Matches values that are not included in the specified array.
   * For array fields, matches if no element is in the provided array.
   * For non-array fields, matches if the value is not in the provided array.
   */
  $notIn?: T extends readonly (infer U)[] ? U[] : T[];
  /**
   * Checks if the field exists (true) or does not exist (false).
   */
  $exists?: boolean;
  /**
   * Matches string values using the specified regular expression.
   * Only available for string types.
   */
  $regex?: T extends string ? RegExp : never;
  /**
   * Matches arrays with the specified number of elements.
   * Only available for array types.
   */
  $arraySize?: T extends readonly any[] ? number : never;
}

/**
 * Main database filter type with full autocomplete support for field names
 * and proper typing for each field's operators.
 */
export type DatabaseFilter<T> = {
  /**
   * Field-based filters with autocomplete support.
   * Each field supports direct value matching or query operators based on its type.
   */
  [K in keyof T]?: T[K] | QueryOperators<T[K]>;
} & {
  /**
   * Logical AND - all conditions must be true
   */
  $and?: DatabaseFilter<T>[];
  /**
   * Logical OR - at least one condition must be true
   */
  $or?: DatabaseFilter<T>[];
  /**
   * Logical NOT - the condition must be false
   */
  $not?: DatabaseFilter<T>;
};

export default class Database {
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
    if (!this.options.createDirectory) return;
    
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Acquires a memory-only lock for file operations
   */
  private async acquireLock(file: string): Promise<void> {
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
  private releaseLock(file: string): void {
    this.lockedFiles.delete(file);
  }

  /**
   * Writes data to a JSON file atomically with memory lock
   */
  private async writeJSONFile<T>(filePath: string, data: T): Promise<void> {
    await this.acquireLock(filePath);
    
    try {
      const tempPath = `${filePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tempPath, filePath);
    } finally {
      this.releaseLock(filePath);
    }
  }

  /**
   * Reads and parses a JSON file safely
   */
  private async readJSONFile<T>(filePath: string, schema?: z.ZodSchema<T>): Promise<T | null> {
    try {
      await fs.access(filePath);
    } catch {
      return null;
    }
    
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    if (schema && this.options.validateOnRead) {
      return schema.parse(data);
    }
    
    return data;
  }

  /**
   * Validates data against a Zod schema
   */
  validate<T>(data: unknown, schema: z.ZodSchema<T>): T {
    return schema.parse(data);
  }

  /**
   * Writes a document to a path-based location
   * Example: await db.write("users/123", myData) creates this.basePath/users/123.json
   */
  async write<T>(filePath: string, data: T, schema?: z.ZodSchema<T>): Promise<void> {
    // Validate data if schema is provided
    if (schema) {
      schema.parse(data);
    }

    // Parse the path to separate directory and filename
    const fullPath = path.join(this.basePath, filePath);
    const dirPath = path.dirname(fullPath);
    const fileName = path.basename(fullPath);
    
    // Ensure directory exists
    await this.ensureDirectoryExists(dirPath);
    
    // Create the final file path with .json extension
    const jsonFilePath = path.join(dirPath, `${fileName}.json`);
    
    // Write the file with lock protection
    await this.writeJSONFile(jsonFilePath, data);
  }

  /**
   * Reads a document from a path-based location
   */
  async read<T>(filePath: string, schema?: z.ZodSchema<T>): Promise<T | null> {
    const fullPath = path.join(this.basePath, filePath);
    const dirPath = path.dirname(fullPath);
    const fileName = path.basename(fullPath);
    const jsonFilePath = path.join(dirPath, `${fileName}.json`);
    
    return await this.readJSONFile(jsonFilePath, schema);
  }

  /**
   * Reads all documents from a directory
   */
  async readAll<T>(dirPath: string, schema?: z.ZodSchema<T>): Promise<Map<string, T>> {
    const fullDirPath = path.join(this.basePath, dirPath);
    
    try {
      await fs.access(fullDirPath);
    } catch {
      return new Map();
    }
    
    const files = (await fs.readdir(fullDirPath)).filter(f => f.endsWith('.json'));
    const result = new Map<string, T>();
    
    for (const file of files) {
      const id = path.basename(file, '.json');
      const data = await this.readJSONFile<T>(path.join(fullDirPath, file), schema);
      if (data !== null) {
        result.set(id, data);
      }
    }
    
    return result;
  }

  /**
   * Finds documents matching a filter in a directory
   */
  async find<T>(dirPath: string, filter: DatabaseFilter<T> = {}, schema?: z.ZodSchema<T>): Promise<Map<string, T>> {
    const allData = await this.readAll<T>(dirPath, schema);
    
    if (!filter || Object.keys(filter).length === 0) {
      return allData;
    }
    
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
  async findOne<T>(dirPath: string, filter: DatabaseFilter<T> = {}, schema?: z.ZodSchema<T>): Promise<{ id: string; data: T } | null> {
    const allData = await this.readAll<T>(dirPath, schema);
    
    for (const [id, document] of allData.entries()) {
      if (this.matchesDocument(document, filter)) {
        return { id, data: document };
      }
    }
    
    return null;
  }

  /**
   * Checks if a value matches a filter condition
   */
  private matchesFilter<T>(value: T, filter: QueryOperators<T>): boolean {
    // Check each operator - ALL must pass for the filter to match
    if (filter.$equals !== undefined && value !== filter.$equals) return false;
    if (filter.$notEquals !== undefined && value === filter.$notEquals) return false;
    if (filter.$greaterThan !== undefined && filter.$greaterThan !== null && !(value > filter.$greaterThan)) return false;
    if (filter.$greaterThanOrEqual !== undefined && filter.$greaterThanOrEqual !== null && !(value >= filter.$greaterThanOrEqual)) return false;
    if (filter.$lessThan !== undefined && filter.$lessThan !== null && !(value < filter.$lessThan)) return false;
    if (filter.$lessThanOrEqual !== undefined && filter.$lessThanOrEqual !== null && !(value <= filter.$lessThanOrEqual)) return false;

    if (filter.$in !== undefined) {
      if (Array.isArray(value)) {
        if (!value.some(item => filter.$in!.includes(item))) return false;
      } else {
        if (!filter.$in.includes(value as any)) return false;
      }
    }

    if (filter.$notIn !== undefined) {
      if (Array.isArray(value)) {
        if (value.some(item => filter.$notIn!.includes(item))) return false;
      } else {
        if (filter.$notIn.includes(value as any)) return false;
      }
    }

    if (filter.$exists !== undefined && (value !== undefined && value !== null) !== filter.$exists) return false;
    if (filter.$regex !== undefined && typeof value === 'string' && !filter.$regex.test(value)) return false;
    if (filter.$arraySize !== undefined) {
      if (!Array.isArray(value)) return false; // Must be an array to match arraySize
      if (value.length !== filter.$arraySize) return false;
    }

    // If we reach here, all specified operators passed
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
        if (!this.matchesFilter(documentValue, value as QueryOperators<any>)) {
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
   * Deletes a document from a path-based location
   */
  async delete(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.basePath, filePath);
    const dirPath = path.dirname(fullPath);
    const fileName = path.basename(fullPath);
    const jsonFilePath = path.join(dirPath, `${fileName}.json`);
    
    try {
      await fs.access(jsonFilePath);
    } catch {
      return false;
    }
    
    await this.acquireLock(jsonFilePath);
    
    try {
      await fs.unlink(jsonFilePath);
      return true;
    } finally {
      this.releaseLock(jsonFilePath);
    }
  }

  /**
   * Deletes a whole directory and all its contents
   */
  async drop(dirPath: string): Promise<boolean> {
    const fullDirPath = path.join(this.basePath, dirPath);
    try {
      await fs.access(fullDirPath);
    } catch {
      return false;
    }
    await this.acquireLock(fullDirPath);
    try {
      await fs.rm(fullDirPath, { recursive: true, force: true });
      return true;
    } finally {
      this.releaseLock(fullDirPath);
    }
  }

  /**
   * Creates an empty directory (and parents if needed)
   */
  async create(dirPath: string): Promise<void> {
    const fullDirPath = path.join(this.basePath, dirPath);
    await this.ensureDirectoryExists(fullDirPath);
  }
}