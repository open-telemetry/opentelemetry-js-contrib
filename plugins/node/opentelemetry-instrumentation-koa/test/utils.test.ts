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

import * as utils from '../src/utils';
import * as assert from 'assert';
import { KoaInstrumentationConfig } from '../src/types';
import { KoaLayerType } from '../src/internal-types';

describe('Utils', () => {
  describe('isLayerIgnored()', () => {
    it('should not fail with invalid config', () => {
      assert.strictEqual(utils.isLayerIgnored(KoaLayerType.MIDDLEWARE), false);
      assert.strictEqual(
        utils.isLayerIgnored(
          KoaLayerType.MIDDLEWARE,
          {} as KoaInstrumentationConfig
        ),
        false
      );
      assert.strictEqual(
        utils.isLayerIgnored(KoaLayerType.MIDDLEWARE, {
          ignoreLayersType: {},
        } as KoaInstrumentationConfig),
        false
      );
      assert.strictEqual(
        utils.isLayerIgnored(KoaLayerType.ROUTER, {
          ignoreLayersType: {},
        } as KoaInstrumentationConfig),
        false
      );
    });

    it('should ignore based on type', () => {
      assert.strictEqual(
        utils.isLayerIgnored(KoaLayerType.MIDDLEWARE, {
          ignoreLayersType: [KoaLayerType.MIDDLEWARE],
        }),
        true
      );
      assert.strictEqual(
        utils.isLayerIgnored(KoaLayerType.ROUTER, {
          ignoreLayersType: [KoaLayerType.MIDDLEWARE],
        }),
        false
      );
    });
  });
});
