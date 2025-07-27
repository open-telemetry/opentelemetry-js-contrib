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
import {
  getConnectionAttributesFromServer,
  getConnectionAttributesFromUrl,
} from '../src/utils';
import {
  ATTR_NETWORK_PEER_ADDRESS,
  ATTR_NETWORK_PEER_PORT,
  ATTR_NETWORK_PROTOCOL_NAME,
  ATTR_NETWORK_PROTOCOL_VERSION,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  SEMATTRS_MESSAGING_PROTOCOL,
  SEMATTRS_MESSAGING_PROTOCOL_VERSION,
  SEMATTRS_MESSAGING_SYSTEM,
  SEMATTRS_MESSAGING_URL,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
} from '@opentelemetry/semantic-conventions';
import * as amqp from 'amqplib';
import { shouldTest } from './utils';
import { rabbitMqUrl } from './config';
import { SemconvStability } from '@opentelemetry/instrumentation';
import { ATTR_MESSAGING_SYSTEM } from '@opentelemetry/semantic-conventions/incubating';

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

    describe('Old attributes', () => {
      it('messaging system attribute', () => {
        const attributes = getConnectionAttributesFromServer(conn.connection);
        expect(attributes).toStrictEqual({
          [SEMATTRS_MESSAGING_SYSTEM]: 'rabbitmq',
        });
      });
    });

    describe('Stable attributes', () => {
      it('messaging system attribute', () => {
        const attributes = getConnectionAttributesFromServer(conn.connection);
        expect(attributes).toStrictEqual({
          [ATTR_MESSAGING_SYSTEM]: 'rabbitmq',
        });
      });
    });
  });

  describe('getConnectionAttributesFromUrl', () => {
    describe('Old attributes', () => {
      it('all features', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user:pass@host:10000/vhost',
          SemconvStability.OLD
        );
        expect(attributes).toStrictEqual({
          [SEMATTRS_MESSAGING_PROTOCOL]: 'AMQP',
          [SEMATTRS_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
          [SEMATTRS_NET_PEER_NAME]: 'host',
          [SEMATTRS_NET_PEER_PORT]: 10000,
          [SEMATTRS_MESSAGING_URL]: 'amqp://user:***@host:10000/vhost',
        });
      });

      it('all features encoded', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user%61:%61pass@ho%61st:10000/v%2fhost',
          SemconvStability.OLD
        );
        expect(attributes).toStrictEqual({
          [SEMATTRS_MESSAGING_PROTOCOL]: 'AMQP',
          [SEMATTRS_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
          [SEMATTRS_NET_PEER_NAME]: 'ho%61st',
          [SEMATTRS_NET_PEER_PORT]: 10000,
          [SEMATTRS_MESSAGING_URL]: 'amqp://user%61:***@ho%61st:10000/v%2fhost',
        });
      });

      it('only protocol', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://',
          SemconvStability.OLD
        );
        expect(attributes).toStrictEqual({
          [SEMATTRS_MESSAGING_PROTOCOL]: 'AMQP',
          [SEMATTRS_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
          [SEMATTRS_NET_PEER_NAME]: 'localhost',
          [SEMATTRS_NET_PEER_PORT]: 5672,
          [SEMATTRS_MESSAGING_URL]: 'amqp://',
        });
      });

      it('empty username and password', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://:@/',
          SemconvStability.OLD
        );
        expect(attributes).toStrictEqual({
          [SEMATTRS_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
          [SEMATTRS_MESSAGING_URL]: 'amqp://:***@/',
        });
      });

      it('username and no password', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user@',
          SemconvStability.OLD
        );
        expect(attributes).toStrictEqual({
          [SEMATTRS_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
          [SEMATTRS_MESSAGING_URL]: 'amqp://user@',
        });
      });

      it('username and password, no host', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user:pass@',
          SemconvStability.OLD
        );
        expect(attributes).toStrictEqual({
          [SEMATTRS_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
          [SEMATTRS_MESSAGING_URL]: 'amqp://user:***@',
        });
      });

      it('host only', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://host',
          SemconvStability.OLD
        );
        expect(attributes).toStrictEqual({
          [SEMATTRS_MESSAGING_PROTOCOL]: 'AMQP',
          [SEMATTRS_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
          [SEMATTRS_NET_PEER_NAME]: 'host',
          [SEMATTRS_NET_PEER_PORT]: 5672,
          [SEMATTRS_MESSAGING_URL]: 'amqp://host',
        });
      });

      it('vhost only', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp:///vhost',
          SemconvStability.OLD
        );
        expect(attributes).toStrictEqual({
          [SEMATTRS_MESSAGING_PROTOCOL]: 'AMQP',
          [SEMATTRS_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
          [SEMATTRS_NET_PEER_NAME]: 'localhost',
          [SEMATTRS_NET_PEER_PORT]: 5672,
          [SEMATTRS_MESSAGING_URL]: 'amqp:///vhost',
        });
      });

      it('host only, trailing slash', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://host/',
          SemconvStability.OLD
        );
        expect(attributes).toStrictEqual({
          [SEMATTRS_MESSAGING_PROTOCOL]: 'AMQP',
          [SEMATTRS_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
          [SEMATTRS_NET_PEER_NAME]: 'host',
          [SEMATTRS_NET_PEER_PORT]: 5672,
          [SEMATTRS_MESSAGING_URL]: 'amqp://host/',
        });
      });

      it('vhost encoded', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://host/%2f',
          SemconvStability.OLD
        );
        expect(attributes).toStrictEqual({
          [SEMATTRS_MESSAGING_PROTOCOL]: 'AMQP',
          [SEMATTRS_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
          [SEMATTRS_NET_PEER_NAME]: 'host',
          [SEMATTRS_NET_PEER_PORT]: 5672,
          [SEMATTRS_MESSAGING_URL]: 'amqp://host/%2f',
        });
      });

      it('IPv6 host', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://[::1]',
          SemconvStability.OLD
        );
        expect(attributes).toStrictEqual({
          [SEMATTRS_MESSAGING_PROTOCOL]: 'AMQP',
          [SEMATTRS_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
          [SEMATTRS_NET_PEER_NAME]: '[::1]',
          [SEMATTRS_NET_PEER_PORT]: 5672,
          [SEMATTRS_MESSAGING_URL]: 'amqp://[::1]',
        });
      });
    });

    describe('Stable attributes', () => {
      it('all features', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user:pass@host:10000/vhost',
          SemconvStability.STABLE
        );
        expect(attributes).toStrictEqual({
          [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
          [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
          [ATTR_NETWORK_PEER_ADDRESS]: 'host',
          [ATTR_NETWORK_PEER_PORT]: 10000,
          [ATTR_SERVER_ADDRESS]: 'host',
          [ATTR_SERVER_PORT]: 10000,
        });
      });

      it('all features encoded', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user%61:%61pass@ho%61st:10000/v%2fhost',
          SemconvStability.STABLE
        );
        expect(attributes).toStrictEqual({
          [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
          [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
          [ATTR_NETWORK_PEER_ADDRESS]: 'ho%61st',
          [ATTR_NETWORK_PEER_PORT]: 10000,
          [ATTR_SERVER_ADDRESS]: 'ho%61st',
          [ATTR_SERVER_PORT]: 10000,
        });
      });

      it('only protocol', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://',
          SemconvStability.STABLE
        );
        expect(attributes).toStrictEqual({
          [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
          [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
          [ATTR_NETWORK_PEER_ADDRESS]: 'localhost',
          [ATTR_NETWORK_PEER_PORT]: 5672,
          [ATTR_SERVER_ADDRESS]: 'localhost',
          [ATTR_SERVER_PORT]: 5672,
        });
      });

      it('empty username and password', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://:@/',
          SemconvStability.STABLE
        );
        expect(attributes).toStrictEqual({
          [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
        });
      });

      it('username and no password', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user@',
          SemconvStability.STABLE
        );
        expect(attributes).toStrictEqual({
          [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
        });
      });

      it('username and password, no host', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user:pass@',
          SemconvStability.STABLE
        );
        expect(attributes).toStrictEqual({
          [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
        });
      });

      it('host only', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://host',
          SemconvStability.STABLE
        );
        expect(attributes).toStrictEqual({
          [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
          [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
          [ATTR_NETWORK_PEER_ADDRESS]: 'host',
          [ATTR_NETWORK_PEER_PORT]: 5672,
          [ATTR_SERVER_ADDRESS]: 'host',
          [ATTR_SERVER_PORT]: 5672,
        });
      });

      it('vhost only', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp:///vhost',
          SemconvStability.STABLE
        );
        expect(attributes).toStrictEqual({
          [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
          [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
          [ATTR_NETWORK_PEER_ADDRESS]: 'localhost',
          [ATTR_NETWORK_PEER_PORT]: 5672,
          [ATTR_SERVER_ADDRESS]: 'localhost',
          [ATTR_SERVER_PORT]: 5672,
        });
      });

      it('host only, trailing slash', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://host/',
          SemconvStability.STABLE
        );
        expect(attributes).toStrictEqual({
          [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
          [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
          [ATTR_NETWORK_PEER_ADDRESS]: 'host',
          [ATTR_NETWORK_PEER_PORT]: 5672,
          [ATTR_SERVER_ADDRESS]: 'host',
          [ATTR_SERVER_PORT]: 5672,
        });
      });

      it('vhost encoded', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://host/%2f',
          SemconvStability.STABLE
        );
        expect(attributes).toStrictEqual({
          [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
          [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
          [ATTR_NETWORK_PEER_ADDRESS]: 'host',
          [ATTR_NETWORK_PEER_PORT]: 5672,
          [ATTR_SERVER_ADDRESS]: 'host',
          [ATTR_SERVER_PORT]: 5672,
        });
      });

      it('IPv6 host', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://[::1]',
          SemconvStability.STABLE
        );
        expect(attributes).toStrictEqual({
          [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
          [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
          [ATTR_NETWORK_PEER_ADDRESS]: '[::1]',
          [ATTR_NETWORK_PEER_PORT]: 5672,
          [ATTR_SERVER_ADDRESS]: '[::1]',
          [ATTR_SERVER_PORT]: 5672,
        });
      });
    });

    describe('Both old and stable attributes', () => {
      it('all features', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user:pass@host:10000/vhost',
          SemconvStability.OLD | SemconvStability.STABLE
        );
        expect(attributes).toStrictEqual({
          [SEMATTRS_MESSAGING_PROTOCOL]: 'AMQP',
          [SEMATTRS_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
          [SEMATTRS_NET_PEER_NAME]: 'host',
          [SEMATTRS_NET_PEER_PORT]: 10000,
          [SEMATTRS_MESSAGING_URL]: 'amqp://user:***@host:10000/vhost',
          [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
          [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
          [ATTR_NETWORK_PEER_ADDRESS]: 'host',
          [ATTR_NETWORK_PEER_PORT]: 10000,
          [ATTR_SERVER_ADDRESS]: 'host',
          [ATTR_SERVER_PORT]: 10000,
        });
      });
    });
  });
});
