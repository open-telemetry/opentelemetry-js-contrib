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
import {
  buildMicroserviceContextDefinitions,
  getInstanceName,
  getTransportAttribute,
  serializeAttributeValue,
} from '../src/utils';

describe('utils', () => {
  describe('buildMicroserviceContextDefinitions', () => {
    it('should support legacy listener metadata with a single pattern', () => {
      const targetCallback = function sumNumbers() {
        return undefined;
      };

      const definitions = buildMicroserviceContextDefinitions(
        [
          {
            methodKey: 'sumNumbers',
            pattern: 'sum',
            targetCallback,
          },
        ],
        {
          metatype: { name: 'MicroserviceController' },
        },
        undefined
      );

      assert.deepStrictEqual(definitions, [
        {
          callbackName: 'sumNumbers',
          instanceName: 'MicroserviceController',
          pattern: 'sum',
          transportId: undefined,
        },
      ]);
    });

    it('should support listener metadata with multiple patterns', () => {
      const targetCallback = function handleNotification() {
        return undefined;
      };

      const definitions = buildMicroserviceContextDefinitions(
        [
          {
            methodKey: 'handleNotification',
            patterns: ['notification', 'notification.v2'],
            targetCallback,
          },
        ],
        {
          metatype: { name: 'MicroserviceController' },
        },
        undefined
      );

      assert.deepStrictEqual(definitions, [
        {
          callbackName: 'handleNotification',
          instanceName: 'MicroserviceController',
          pattern: 'notification',
          transportId: undefined,
        },
        {
          callbackName: 'handleNotification',
          instanceName: 'MicroserviceController',
          pattern: 'notification.v2',
          transportId: undefined,
        },
      ]);
    });

    it('should filter out definitions with a different transport', () => {
      const definitions = buildMicroserviceContextDefinitions(
        [
          {
            methodKey: 'sumNumbers',
            pattern: 'sum',
            targetCallback() {
              return undefined;
            },
            transport: 'redis',
          },
        ],
        {
          metatype: { name: 'MicroserviceController' },
        },
        'tcp'
      );

      assert.deepStrictEqual(definitions, []);
    });
  });

  describe('getInstanceName', () => {
    it('should return the constructor name when available', () => {
      class NamedController {}

      assert.strictEqual(
        getInstanceName(new NamedController()),
        'NamedController'
      );
    });

    it('should fall back to UnnamedInstance', () => {
      assert.strictEqual(getInstanceName(undefined), 'UnnamedInstance');
    });
  });

  describe('getTransportAttribute', () => {
    it('should prefer the explicit transport option', () => {
      assert.strictEqual(getTransportAttribute({ transport: 'tcp' }), 'tcp');
    });

    it('should fall back to the strategy constructor name', () => {
      class TestTransportStrategy {}

      assert.strictEqual(
        getTransportAttribute({ strategy: new TestTransportStrategy() }),
        'TestTransportStrategy'
      );
    });
  });

  describe('serializeAttributeValue', () => {
    it('should serialize primitives and objects to strings', () => {
      assert.strictEqual(serializeAttributeValue(42), '42');
      assert.strictEqual(serializeAttributeValue(false), 'false');
      assert.strictEqual(
        serializeAttributeValue({ pattern: 'sum' }),
        '{"pattern":"sum"}'
      );
    });

    it('should preserve strings and undefined values', () => {
      assert.strictEqual(serializeAttributeValue('sum'), 'sum');
      assert.strictEqual(serializeAttributeValue(undefined), undefined);
    });
  });
});
