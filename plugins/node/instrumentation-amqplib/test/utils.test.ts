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
import 'mocha';
import * as expect from 'expect';
import {
  getConnectionAttributesFromServer,
  getConnectionAttributesFromUrl,
} from '../src/utils';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import * as amqp from 'amqplib';
import { shouldTest } from './utils';
import { rabbitMqUrl } from './config';

describe('utils', () => {
  describe('getConnectionAttributesFromServer', () => {
    let conn: amqp.Connection;
    before(async function () {
      if (!shouldTest) {
        this.skip();
      } else {
        conn = await amqp.connect(rabbitMqUrl);
      }
    });
    after(async () => {
      if (shouldTest) {
        await conn.close();
      }
    });

    it('messaging system attribute', () => {
      const attributes = getConnectionAttributesFromServer(conn.connection);
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_SYSTEM]: 'rabbitmq',
      });
    });
  });

  describe('getConnectionAttributesFromUrl', () => {
    it('all features', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://user:pass@host:10000/vhost'
      );
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL]: 'AMQP',
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [SemanticAttributes.NET_PEER_NAME]: 'host',
        [SemanticAttributes.NET_PEER_PORT]: 10000,
        [SemanticAttributes.MESSAGING_URL]: 'amqp://user:***@host:10000/vhost',
      });
    });

    it('all features encoded', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://user%61:%61pass@ho%61st:10000/v%2fhost'
      );
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL]: 'AMQP',
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [SemanticAttributes.NET_PEER_NAME]: 'ho%61st',
        [SemanticAttributes.NET_PEER_PORT]: 10000,
        [SemanticAttributes.MESSAGING_URL]:
          'amqp://user%61:***@ho%61st:10000/v%2fhost',
      });
    });

    it('only protocol', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://');
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL]: 'AMQP',
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [SemanticAttributes.NET_PEER_NAME]: 'localhost',
        [SemanticAttributes.NET_PEER_PORT]: 5672,
        [SemanticAttributes.MESSAGING_URL]: 'amqp://',
      });
    });

    it('empty username and password', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://:@/');
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [SemanticAttributes.MESSAGING_URL]: 'amqp://:***@/',
      });
    });

    it('username and no password', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://user@');
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [SemanticAttributes.MESSAGING_URL]: 'amqp://user@',
      });
    });

    it('username and password, no host', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://user:pass@');
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [SemanticAttributes.MESSAGING_URL]: 'amqp://user:***@',
      });
    });

    it('host only', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://host');
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL]: 'AMQP',
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [SemanticAttributes.NET_PEER_NAME]: 'host',
        [SemanticAttributes.NET_PEER_PORT]: 5672,
        [SemanticAttributes.MESSAGING_URL]: 'amqp://host',
      });
    });

    it('vhost only', () => {
      const attributes = getConnectionAttributesFromUrl('amqp:///vhost');
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL]: 'AMQP',
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [SemanticAttributes.NET_PEER_NAME]: 'localhost',
        [SemanticAttributes.NET_PEER_PORT]: 5672,
        [SemanticAttributes.MESSAGING_URL]: 'amqp:///vhost',
      });
    });

    it('host only, trailing slash', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://host/');
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL]: 'AMQP',
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [SemanticAttributes.NET_PEER_NAME]: 'host',
        [SemanticAttributes.NET_PEER_PORT]: 5672,
        [SemanticAttributes.MESSAGING_URL]: 'amqp://host/',
      });
    });

    it('vhost encoded', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://host/%2f');
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL]: 'AMQP',
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [SemanticAttributes.NET_PEER_NAME]: 'host',
        [SemanticAttributes.NET_PEER_PORT]: 5672,
        [SemanticAttributes.MESSAGING_URL]: 'amqp://host/%2f',
      });
    });

    it('IPv6 host', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://[::1]');
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL]: 'AMQP',
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [SemanticAttributes.NET_PEER_NAME]: '[::1]',
        [SemanticAttributes.NET_PEER_PORT]: 5672,
        [SemanticAttributes.MESSAGING_URL]: 'amqp://[::1]',
      });
    });
  });
});
