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
import {
  IgnoreMatcher,
  KoaInstrumentationConfig,
  KoaLayerType,
} from '../src/types';

describe('Utils', () => {
  describe('isLayerTypeIgnored()', () => {
    it('should not fail with invalid config', () => {
      assert.strictEqual(
        utils.isLayerTypeIgnored(KoaLayerType.MIDDLEWARE),
        false
      );
      assert.strictEqual(
        utils.isLayerTypeIgnored(
          KoaLayerType.MIDDLEWARE,
          {} as KoaInstrumentationConfig
        ),
        false
      );
      assert.strictEqual(
        utils.isLayerTypeIgnored(KoaLayerType.MIDDLEWARE, {
          ignoreLayersType: {},
        } as KoaInstrumentationConfig),
        false
      );
      assert.strictEqual(
        utils.isLayerTypeIgnored(KoaLayerType.ROUTER, {
          ignoreLayersType: {},
        } as KoaInstrumentationConfig),
        false
      );
    });

    it('should ignore based on type', () => {
      assert.strictEqual(
        utils.isLayerTypeIgnored(KoaLayerType.MIDDLEWARE, {
          ignoreLayersType: [KoaLayerType.MIDDLEWARE],
        }),
        true
      );
      assert.strictEqual(
        utils.isLayerTypeIgnored(KoaLayerType.ROUTER, {
          ignoreLayersType: [KoaLayerType.MIDDLEWARE],
        }),
        false
      );
    });
  });
  describe('isLayerNameIgnored()', () => {
    it('should not fail with invalid config', () => {
      assert.strictEqual(utils.isLayerNameIgnored('name', {}), false);
      assert.strictEqual(
        utils.isLayerNameIgnored('name', {} as KoaInstrumentationConfig),
        false
      );
      assert.strictEqual(
        utils.isLayerNameIgnored('name', {
          ignoreLayers: {},
        } as KoaInstrumentationConfig),
        false
      );
      assert.strictEqual(utils.isLayerNameIgnored('name'), false);
    });

    it('should ignore based on name', () => {
      assert.strictEqual(
        utils.isLayerNameIgnored('logger', {
          ignoreLayers: ['logger'],
        }),
        true
      );
      assert.strictEqual(
        utils.isLayerNameIgnored('logger', {
          ignoreLayers: ['logger'],
        }),
        true
      );
      assert.strictEqual(
        utils.isLayerNameIgnored('', {
          ignoreLayers: ['logger'],
        }),
        false
      );
      assert.strictEqual(
        utils.isLayerNameIgnored('logger - test', {
          ignoreLayers: [/logger/],
        }),
        true
      );
      assert.strictEqual(
        utils.isLayerNameIgnored('router - test', {
          ignoreLayers: [/logger/],
        }),
        false
      );
      assert.strictEqual(
        utils.isLayerNameIgnored('test', {
          ignoreLayers: [(name: string) => name === 'test'],
        }),
        true
      );
      assert.strictEqual(
        utils.isLayerNameIgnored('test', {
          ignoreLayers: [(name: string) => name === 'router'],
        }),
        false
      );
    });
  });
});

describe('Utility', () => {
  describe('satisfiesPattern()', () => {
    it('string pattern', () => {
      const answer1 = utils.satisfiesPattern('localhost', 'localhost');
      assert.strictEqual(answer1, true);
      const answer2 = utils.satisfiesPattern('hostname', 'localhost');
      assert.strictEqual(answer2, false);
    });

    it('regex pattern', () => {
      const answer1 = utils.satisfiesPattern('LocalHost', /localhost/i);
      assert.strictEqual(answer1, true);
      const answer2 = utils.satisfiesPattern('Montreal.ca', /montreal.ca/);
      assert.strictEqual(answer2, false);
    });

    it('should throw if type is unknown', () => {
      try {
        utils.satisfiesPattern('google.com', true as unknown as IgnoreMatcher);
        assert.fail();
      } catch (error) {
        assert.strictEqual(error instanceof TypeError, true);
      }
    });

    it('function pattern', () => {
      const answer1 = utils.satisfiesPattern(
        'montreal.ca',
        (url: string) => url === 'montreal.ca'
      );
      assert.strictEqual(answer1, true);
      const answer2 = utils.satisfiesPattern(
        'montreal.ca',
        (url: string) => url !== 'montreal.ca'
      );
      assert.strictEqual(answer2, false);
    });
  });
});
