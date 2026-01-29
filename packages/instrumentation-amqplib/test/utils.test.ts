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
import { expect } from 'expect';
import { SemconvStability } from '@opentelemetry/instrumentation';
import {
  getConnectionAttributesFromServer,
  getConnectionAttributesFromUrl,
} from '../src/utils';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_MESSAGING_SYSTEM,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
} from '../src/semconv';
import {
  ATTR_MESSAGING_PROTOCOL,
  ATTR_MESSAGING_PROTOCOL_VERSION,
  ATTR_MESSAGING_URL,
} from '../src/semconv-obsolete';
import * as amqp from 'amqplib';
import { shouldTest } from './utils';
import { rabbitMqUrl } from './config';

describe('utils', () => {
  describe('getConnectionAttributesFromServer', () => {
    let conn: amqp.ChannelModel;
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
        [ATTR_MESSAGING_SYSTEM]: 'rabbitmq',
      });
    });
  });

  describe('getConnectionAttributesFromUrl', () => {
    it('all features', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://user:pass@host:10000/vhost',
        SemconvStability.OLD
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_NET_PEER_NAME]: 'host',
        [ATTR_NET_PEER_PORT]: 10000,
        [ATTR_MESSAGING_URL]: 'amqp://user:***@host:10000/vhost',
      });
    });

    it('all features encoded', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://user%61:%61pass@ho%61st:10000/v%2fhost',
        SemconvStability.OLD
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_NET_PEER_NAME]: 'ho%61st',
        [ATTR_NET_PEER_PORT]: 10000,
        [ATTR_MESSAGING_URL]: 'amqp://user%61:***@ho%61st:10000/v%2fhost',
      });
    });

    it('only protocol', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://',
        SemconvStability.OLD
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_NET_PEER_NAME]: 'localhost',
        [ATTR_NET_PEER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp://',
      });
    });

    it('empty username and password', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://:@/',
        SemconvStability.OLD
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_MESSAGING_URL]: 'amqp://:***@/',
      });
    });

    it('username and no password', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://user@',
        SemconvStability.OLD
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_MESSAGING_URL]: 'amqp://user@',
      });
    });

    it('username and password, no host', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://user:pass@',
        SemconvStability.OLD
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_MESSAGING_URL]: 'amqp://user:***@',
      });
    });

    it('host only', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://host',
        SemconvStability.OLD
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_NET_PEER_NAME]: 'host',
        [ATTR_NET_PEER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp://host',
      });
    });

    it('vhost only', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp:///vhost',
        SemconvStability.OLD
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_NET_PEER_NAME]: 'localhost',
        [ATTR_NET_PEER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp:///vhost',
      });
    });

    it('host only, trailing slash', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://host/',
        SemconvStability.OLD
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_NET_PEER_NAME]: 'host',
        [ATTR_NET_PEER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp://host/',
      });
    });

    it('vhost encoded', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://host/%2f',
        SemconvStability.OLD
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_NET_PEER_NAME]: 'host',
        [ATTR_NET_PEER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp://host/%2f',
      });
    });

    it('IPv6 host', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://[::1]',
        SemconvStability.OLD
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_NET_PEER_NAME]: '[::1]',
        [ATTR_NET_PEER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp://[::1]',
      });
    });

    describe('semconv stability', () => {
      it('OLD semconv emits net.peer.* attributes', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user:pass@host:10000/vhost',
          SemconvStability.OLD
        );
        expect(attributes[ATTR_NET_PEER_NAME]).toEqual('host');
        expect(attributes[ATTR_NET_PEER_PORT]).toEqual(10000);
        expect(attributes[ATTR_SERVER_ADDRESS]).toBeUndefined();
        expect(attributes[ATTR_SERVER_PORT]).toBeUndefined();
      });

      it('STABLE semconv emits server.* attributes', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user:pass@host:10000/vhost',
          SemconvStability.STABLE
        );
        expect(attributes[ATTR_NET_PEER_NAME]).toBeUndefined();
        expect(attributes[ATTR_NET_PEER_PORT]).toBeUndefined();
        expect(attributes[ATTR_SERVER_ADDRESS]).toEqual('host');
        expect(attributes[ATTR_SERVER_PORT]).toEqual(10000);
      });

      it('DUPLICATE semconv emits both old and stable attributes', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user:pass@host:10000/vhost',
          SemconvStability.DUPLICATE
        );
        expect(attributes[ATTR_NET_PEER_NAME]).toEqual('host');
        expect(attributes[ATTR_NET_PEER_PORT]).toEqual(10000);
        expect(attributes[ATTR_SERVER_ADDRESS]).toEqual('host');
        expect(attributes[ATTR_SERVER_PORT]).toEqual(10000);
      });

      it('OLD semconv with url object emits net.peer.* attributes', () => {
        const attributes = getConnectionAttributesFromUrl(
          {
            protocol: 'amqp',
            hostname: 'testhost',
            port: 5673,
          },
          SemconvStability.OLD
        );
        expect(attributes[ATTR_NET_PEER_NAME]).toEqual('testhost');
        expect(attributes[ATTR_NET_PEER_PORT]).toEqual(5673);
        expect(attributes[ATTR_SERVER_ADDRESS]).toBeUndefined();
        expect(attributes[ATTR_SERVER_PORT]).toBeUndefined();
      });

      it('STABLE semconv with url object emits server.* attributes', () => {
        const attributes = getConnectionAttributesFromUrl(
          {
            protocol: 'amqp',
            hostname: 'testhost',
            port: 5673,
          },
          SemconvStability.STABLE
        );
        expect(attributes[ATTR_NET_PEER_NAME]).toBeUndefined();
        expect(attributes[ATTR_NET_PEER_PORT]).toBeUndefined();
        expect(attributes[ATTR_SERVER_ADDRESS]).toEqual('testhost');
        expect(attributes[ATTR_SERVER_PORT]).toEqual(5673);
      });

      it('DUPLICATE semconv with url object emits both attributes', () => {
        const attributes = getConnectionAttributesFromUrl(
          {
            protocol: 'amqp',
            hostname: 'testhost',
            port: 5673,
          },
          SemconvStability.DUPLICATE
        );
        expect(attributes[ATTR_NET_PEER_NAME]).toEqual('testhost');
        expect(attributes[ATTR_NET_PEER_PORT]).toEqual(5673);
        expect(attributes[ATTR_SERVER_ADDRESS]).toEqual('testhost');
        expect(attributes[ATTR_SERVER_PORT]).toEqual(5673);
      });
    });
  });
});
