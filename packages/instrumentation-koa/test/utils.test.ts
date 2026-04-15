/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as utils from '../src/utils';
import * as assert from 'assert';
import { KoaInstrumentationConfig, KoaLayerType } from '../src/types';

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
