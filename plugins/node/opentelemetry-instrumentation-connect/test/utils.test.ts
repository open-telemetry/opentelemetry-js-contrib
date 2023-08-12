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

import { PatchedRequest, _LAYERS_STORE_PROPERTY } from '../src/internal-types';
import {
  addNewStackLayer,
  generateRoute,
  replaceCurrentStackRoute,
} from '../src/utils';

describe('utils', () => {
  describe('addNewStackLayer', () => {
    it('should inject new array to symbol property if not exist', () => {
      const fakeRequest = {} as PatchedRequest;

      addNewStackLayer(fakeRequest);

      assert.strictEqual(fakeRequest[_LAYERS_STORE_PROPERTY].length, 1);
    });

    it('should append new stack item if private symbol already exists', () => {
      const stack = ['/first'];
      const fakeRequest = {
        [_LAYERS_STORE_PROPERTY]: stack,
      } as PatchedRequest;

      addNewStackLayer(fakeRequest);

      assert.equal(fakeRequest[_LAYERS_STORE_PROPERTY], stack);
      assert.strictEqual(fakeRequest[_LAYERS_STORE_PROPERTY].length, 2);
    });

    it('should return pop method to remove newly add stack', () => {
      const fakeRequest = {} as PatchedRequest;

      const pop = addNewStackLayer(fakeRequest);

      assert.notStrictEqual(pop, undefined);

      pop();

      assert.strictEqual(fakeRequest[_LAYERS_STORE_PROPERTY].length, 0);
    });

    it('should prevent pop the same stack item multiple time', () => {
      const fakeRequest = {} as PatchedRequest;

      addNewStackLayer(fakeRequest); // add first stack item
      const pop = addNewStackLayer(fakeRequest); // add second stack item

      pop();
      pop();

      assert.strictEqual(fakeRequest[_LAYERS_STORE_PROPERTY].length, 1);
    });
  });

  describe('replaceCurrentStackRoute', () => {
    it('should replace the last stack item with new value', () => {
      const fakeRequest = {
        [_LAYERS_STORE_PROPERTY]: ['/first', '/second'],
      } as PatchedRequest;

      replaceCurrentStackRoute(fakeRequest, '/new_route');

      assert.strictEqual(fakeRequest[_LAYERS_STORE_PROPERTY].length, 2);
      assert.strictEqual(fakeRequest[_LAYERS_STORE_PROPERTY][1], '/new_route');
    });
  });

  describe('generateRoute', () => {
    it('should combine the stack and striped anu slash between layer', () => {
      const fakeRequest = {
        [_LAYERS_STORE_PROPERTY]: ['/first/', '/second', '/third/'],
      } as PatchedRequest;

      const route = generateRoute(fakeRequest);

      assert.strictEqual(route, '/first/second/third/');
    });
  });
});
