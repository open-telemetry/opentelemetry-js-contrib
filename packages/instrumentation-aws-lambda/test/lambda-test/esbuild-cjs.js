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

// Simulates esbuild's ESM-to-CJS output which uses non-configurable accessor
// descriptors on exports. This causes shimmer to fail with "Cannot redefine
// property" unless the instrumentation handles it.
// See: https://github.com/evanw/esbuild/issues/2199

'use strict';
Object.defineProperty(exports, '__esModule', { value: true });

async function handler(event, context) {
  return 'ok';
}

async function error(event, context) {
  throw new Error('handler error');
}

Object.defineProperty(exports, 'handler', {
  enumerable: true,
  get: function () { return handler; },
  // intentionally no configurable: true — this is what esbuild produces
});

Object.defineProperty(exports, 'error', {
  enumerable: true,
  get: function () { return error; },
});
