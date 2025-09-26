/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'assert';
import { MongoDBInstrumentation } from '../../src';

describe('DbStatementSerializer', () => {
  let instrumentation: MongoDBInstrumentation;

  beforeEach(() => {
    instrumentation = new MongoDBInstrumentation();
  });

  const testDefaultDbStatementSerialization = (
    commandObj: Record<string, unknown>,
    config: any
  ): string => {
    instrumentation.setConfig(config);
    return (instrumentation as any)._defaultDbStatementSerializer(commandObj);
  };

  describe('default db statement serialization', () => {
    it('should handle deeply nested objects without stack overflow', () => {
      // Create a deeply nested object that could cause stack overflow
      let deeplyNested: any = { value: 'test' };
      for (let i = 0; i < 500; i++) {
        deeplyNested = { level: i, nested: deeplyNested };
      }

      const commandObj = {
        insert: 'test-collection',
        documents: [deeplyNested],
      };

      const result = testDefaultDbStatementSerialization(commandObj, {
        enhancedDatabaseReporting: false,
      });

      assert(typeof result === 'string', 'Result should be a string');
      assert(result!.length > 0, 'Result should not be empty');
    });

    it('should handle circular references gracefully with replacer function', () => {
      // Create an object with circular reference
      const circularObj: any = { a: 1, b: 2 };
      circularObj.circular = circularObj;

      const commandObj = {
        insert: 'test-collection',
        documents: [circularObj],
      };

      const result = testDefaultDbStatementSerialization(commandObj, {
        enhancedDatabaseReporting: false,
      });

      assert(typeof result === 'string', 'Result should be a string');
      assert(result.length > 0, 'Result should not be empty');

      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.insert, '?', 'Values should be scrubbed');
      assert.strictEqual(
        parsed.documents[0].circular,
        '[Circular]',
        'Circular reference should be marked as [Circular]'
      );
    });

    it('should handle enhancedDatabaseReporting: true with circular references', () => {
      const circularObj: any = { a: 1 };
      circularObj.circular = circularObj;

      const commandObj = {
        insert: 'test-collection',
        documents: [circularObj],
      };

      // With enhancedDatabaseReporting: true, it uses simple JSON.stringify which should throw
      assert.throws(
        () => {
          testDefaultDbStatementSerialization(commandObj, {
            enhancedDatabaseReporting: true,
          });
        },
        /Converting circular structure to JSON/,
        'Should throw on circular references with enhancedDatabaseReporting: true'
      );
    });

    it('should scrub values when enhancedDatabaseReporting is false', () => {
      const commandObj = {
        insert: 'test-collection',
        documents: [{ name: 'John', age: 30 }],
      };

      const result = testDefaultDbStatementSerialization(commandObj, {
        enhancedDatabaseReporting: false,
      });

      const expected = JSON.stringify({
        insert: '?',
        documents: [{ name: '?', age: '?' }],
      });

      assert.strictEqual(result, expected, 'All values should be scrubbed');
    });

    it('should not scrub values when enhancedDatabaseReporting is true', () => {
      const commandObj = {
        insert: 'test-collection',
        documents: [{ name: 'John', age: 30 }],
      };

      const expected = JSON.stringify(commandObj);
      const actualResult = testDefaultDbStatementSerialization(commandObj, {
        enhancedDatabaseReporting: true,
      });

      assert.strictEqual(
        actualResult,
        expected,
        'Values should not be scrubbed'
      );
    });

    it('should handle arrays properly', () => {
      const commandObj = {
        find: 'users',
        filter: { $or: ['condition1', 'condition2', { nested: 'value' }] },
      };

      const result = testDefaultDbStatementSerialization(commandObj, {
        enhancedDatabaseReporting: false,
      });

      const expected = JSON.stringify({
        find: '?',
        filter: { $or: ['?', '?', { nested: '?' }] },
      });

      assert.strictEqual(result, expected, 'Array values should be scrubbed');
    });

    it('should handle objects properly', () => {
      const commandObj = {
        filter: { category: 'electronics' },
        update: { $set: { price: 299.99, available: true } },
      };

      const result = testDefaultDbStatementSerialization(commandObj, {
        enhancedDatabaseReporting: false,
      });

      const expected = JSON.stringify({
        filter: { category: '?' },
        update: { $set: { price: '?', available: '?' } },
      });

      assert.strictEqual(result, expected, 'Object values should be scrubbed');
    });

    it('should handle bigint values', () => {
      const commandObj = {
        insert: 'analytics',
        documents: [
          {
            userId: BigInt(123456789012345),
            timestamp: BigInt(Date.now()),
          },
        ],
      };

      const result = testDefaultDbStatementSerialization(commandObj, {
        enhancedDatabaseReporting: false,
      });

      const expected = JSON.stringify({
        insert: '?',
        documents: [{ userId: '?', timestamp: '?' }],
      });

      assert.strictEqual(result, expected, 'BigInt values should be scrubbed');
    });

    it('should handle deep nested objects', () => {
      const commandObj = {
        aggregate: 'orders',
        pipeline: [
          {
            $match: {
              user: {
                profile: {
                  preferences: {
                    notifications: {
                      email: true,
                      sms: false,
                      push: {
                        enabled: true,
                        frequency: 'daily',
                        categories: ['updates', 'promotions'],
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      };

      const result = testDefaultDbStatementSerialization(commandObj, {
        enhancedDatabaseReporting: false,
      });

      const expected = JSON.stringify({
        aggregate: '?',
        pipeline: [
          {
            $match: {
              user: {
                profile: {
                  preferences: {
                    notifications: {
                      email: '?',
                      sms: '?',
                      push: {
                        enabled: '?',
                        frequency: '?',
                        categories: ['?', '?'],
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      });

      assert.strictEqual(
        result,
        expected,
        'Deep nested values should be scrubbed while preserving structure'
      );
    });

    it('should handle string values', () => {
      const commandObj = {
        find: 'messages',
        filter: { content: 'hello world', sender: 'user123' },
        sort: { timestamp: -1 },
      };

      const result = testDefaultDbStatementSerialization(commandObj, {
        enhancedDatabaseReporting: false,
      });

      const expected = JSON.stringify({
        find: '?',
        filter: { content: '?', sender: '?' },
        sort: { timestamp: '?' },
      });

      assert.strictEqual(result, expected, 'String values should be scrubbed');
    });
  });
});
