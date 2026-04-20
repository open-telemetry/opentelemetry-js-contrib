/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { isAsyncFunction, isPromise } from '../src/utils';
import * as assert from 'assert';

describe('utils', () => {
  describe('isPromise', () => {
    it('should be able to validate a promise to be true', () => {
      assert.strictEqual(isPromise(Promise.resolve()), true);
    });

    it('should be able to validate non-promise to be false', () => {
      assert.strictEqual(isPromise(), false);
      assert.strictEqual(isPromise(null), false);
      assert.strictEqual(isPromise({}), false);
      assert.strictEqual(isPromise('string'), false);
      assert.strictEqual(isPromise(123), false);
      assert.strictEqual(
        isPromise(() => {}),
        false
      );
      assert.strictEqual(isPromise((async () => {}) as any), false);
    });
  });

  describe('isAsyncFunction', () => {
    it('should be able to validate an async function to be true', () => {
      assert.strictEqual(
        isAsyncFunction(async () => {}),
        true
      );
    });

    it('should be able to validate non async function to be false', () => {
      assert.strictEqual(isAsyncFunction(), false);
      assert.strictEqual(isAsyncFunction(null), false);
      assert.strictEqual(isAsyncFunction({}), false);
      assert.strictEqual(isAsyncFunction('string'), false);
      assert.strictEqual(isAsyncFunction(123), false);
      assert.strictEqual(
        isAsyncFunction(() => {}),
        false
      );
      assert.strictEqual(isAsyncFunction(Promise.resolve()), false);
    });
  });
});
