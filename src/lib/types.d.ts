import { z } from 'zod';

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
