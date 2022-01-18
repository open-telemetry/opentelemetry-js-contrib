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

import { throttle } from '../src/util';
import * as sinon from 'sinon';
import * as assert from 'assert';

describe('util', () => {
  describe('throttle', () => {
    let sandbox: sinon.SinonSandbox;
    beforeEach(() => {
      sandbox = sinon.createSandbox();
      sandbox.useFakeTimers();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should call the fn', () => {
      let retValue = '1';
      const stub = sinon.stub();
      const throttled = throttle(stub, 100);

      // no return value is memoized, calls the fn.
      stub.returns(retValue);
      assert.strictEqual(throttled(), retValue);
      assert.strictEqual(throttled(), retValue);

      sandbox.clock.tick(50);
      // the return value is memoized, does not call the fn.
      assert.strictEqual(throttled(), retValue);
      assert.strictEqual(stub.callCount, 1);

      retValue = '2';
      stub.returns(retValue);
      sandbox.clock.tick(50);
      // no return value is memoized, calls the fn.
      assert.strictEqual(throttled(), retValue);
      assert.strictEqual(stub.callCount, 2);
    });

    it('should call the fn with exceptions', () => {
      const stub = sinon.stub();
      const throttled = throttle(stub, 100);

      const error = new Error('foobar');
      stub.throws(error);
      // no return value is memoized, throws.
      assert.throws(throttled, error);
      assert.throws(throttled, error);
      stub.returns('1');
      assert.strictEqual(throttled(), '1');

      sandbox.clock.tick(50);
      assert.strictEqual(throttled(), '1');
      assert.strictEqual(stub.callCount, 3);

      sandbox.clock.tick(50);
      // no return value is memoized, calls the fn.
      assert.strictEqual(throttled(), '1');
      assert.strictEqual(stub.callCount, 4);

      // the return value is memoized, does not throw.
      stub.throws(error);
      assert.strictEqual(throttled(), '1');
      assert.strictEqual(stub.callCount, 4);
    });
  });
});
