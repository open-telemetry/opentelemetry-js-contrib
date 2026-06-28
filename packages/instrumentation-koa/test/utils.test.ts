/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as utils from '../src/utils';
import * as assert from 'assert';
import { KoaInstrumentationConfig, KoaLayerType } from '../src/types';
import { AttributeNames } from '../src/enums/AttributeNames';
import { KoaContext, KoaMiddleware } from '../src/internal-types';

describe('Utils', () => {
  describe('getMiddlewareMetadata()', () => {
    it('should fall back to "middleware" when the middleware function has no name', () => {
      // Inline arrow functions passed as arguments have an empty .name in JS
      // We simulate that directly via the layer object.
      const layer = { name: '' } as unknown as KoaMiddleware;
      const ctx = {} as KoaContext;

      const result = utils.getMiddlewareMetadata(ctx, layer, false);

      assert.strictEqual(result.attributes[AttributeNames.KOA_NAME], 'middleware');
      assert.strictEqual(result.attributes[AttributeNames.KOA_TYPE], KoaLayerType.MIDDLEWARE);
      assert.strictEqual(result.name, 'middleware - middleware');
    });

    it('should use the function name when the middleware is named', () => {
      const layer = { name: 'myHandler' } as unknown as KoaMiddleware;
      const ctx = {} as KoaContext;

      const result = utils.getMiddlewareMetadata(ctx, layer, false);

      assert.strictEqual(result.attributes[AttributeNames.KOA_NAME], 'myHandler');
      assert.strictEqual(result.attributes[AttributeNames.KOA_TYPE], KoaLayerType.MIDDLEWARE);
      assert.strictEqual(result.name, 'middleware - myHandler');
    });
  });

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
