/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import 'mocha';
import { expect } from 'expect';
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
  ATTR_MESSAGING_RABBITMQ_CLUSTER_NAME,
  ATTR_MESSAGING_RABBITMQ_VHOST_NAME,
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
      const attributes = getConnectionAttributesFromServer(
        conn.connection,
        false
      );
      // cluster_name is broker-reported (real RabbitMQ servers include it in
      // server_properties, but this isn't guaranteed for every AMQP 0.9.1
      // broker), so only messaging.system is asserted strictly here.
      expect(attributes[ATTR_MESSAGING_SYSTEM]).toEqual('rabbitmq');
    });
  });

  // Deliberately a sibling of getConnectionAttributesFromServer, not nested inside it -
  // that describe block's `before` hook calls `this.skip()` (skipping the whole block,
  // nested describes included) when no live broker is configured. These tests use a fake
  // connection object and don't need one.
  describe('getConnectionAttributesFromServer - captureClusterName', () => {
    const fakeConn = {
      serverProperties: {
        product: 'RabbitMQ',
        cluster_name: 'rabbit@localhost',
      },
    } as unknown as amqp.Connection;

    it('is omitted by default (captureClusterName: false)', () => {
      const attributes = getConnectionAttributesFromServer(fakeConn, false);
      expect(attributes[ATTR_MESSAGING_RABBITMQ_CLUSTER_NAME]).toBeUndefined();
    });

    it('is included when captureClusterName: true', () => {
      const attributes = getConnectionAttributesFromServer(fakeConn, true);
      expect(attributes[ATTR_MESSAGING_RABBITMQ_CLUSTER_NAME]).toEqual(
        'rabbit@localhost'
      );
    });

    it('is omitted when captureClusterName: true but broker did not report one', () => {
      const noClusterNameConn = {
        serverProperties: { product: 'RabbitMQ' },
      } as unknown as amqp.Connection;
      const attributes = getConnectionAttributesFromServer(
        noClusterNameConn,
        true
      );
      expect(attributes[ATTR_MESSAGING_RABBITMQ_CLUSTER_NAME]).toBeUndefined();
    });
  });

  describe('getConnectionAttributesFromUrl', () => {
    it('all features', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://user:pass@host:10000/vhost',
        true
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_SERVER_ADDRESS]: 'host',
        [ATTR_SERVER_PORT]: 10000,
        [ATTR_MESSAGING_URL]: 'amqp://user:***@host:10000/vhost',
        [ATTR_MESSAGING_RABBITMQ_VHOST_NAME]: 'vhost',
      });
    });

    it('all features encoded', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://user%61:%61pass@ho%61st:10000/v%2fhost',
        true
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_SERVER_ADDRESS]: 'ho%61st',
        [ATTR_SERVER_PORT]: 10000,
        [ATTR_MESSAGING_URL]: 'amqp://user%61:***@ho%61st:10000/v%2fhost',
        [ATTR_MESSAGING_RABBITMQ_VHOST_NAME]: 'v/host',
      });
    });

    it('only protocol', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://', true);
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_SERVER_ADDRESS]: 'localhost',
        [ATTR_SERVER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp://',
        [ATTR_MESSAGING_RABBITMQ_VHOST_NAME]: '/',
      });
    });

    it('empty username and password', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://:@/', true);
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_MESSAGING_URL]: 'amqp://:***@/',
      });
    });

    it('username and no password', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://user@',
        true
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_MESSAGING_URL]: 'amqp://user@',
      });
    });

    it('username and password, no host', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://user:pass@',
        true
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_MESSAGING_URL]: 'amqp://user:***@',
      });
    });

    it('host only', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://host', true);
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_SERVER_ADDRESS]: 'host',
        [ATTR_SERVER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp://host',
        [ATTR_MESSAGING_RABBITMQ_VHOST_NAME]: '/',
      });
    });

    it('vhost only', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp:///vhost',
        true
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_SERVER_ADDRESS]: 'localhost',
        [ATTR_SERVER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp:///vhost',
        [ATTR_MESSAGING_RABBITMQ_VHOST_NAME]: 'vhost',
      });
    });

    it('host only, trailing slash', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://host/', true);
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_SERVER_ADDRESS]: 'host',
        [ATTR_SERVER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp://host/',
        [ATTR_MESSAGING_RABBITMQ_VHOST_NAME]: '/',
      });
    });

    it('vhost encoded', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://host/%2f',
        true
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_SERVER_ADDRESS]: 'host',
        [ATTR_SERVER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp://host/%2f',
        [ATTR_MESSAGING_RABBITMQ_VHOST_NAME]: '/',
      });
    });

    it('IPv6 host', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://[::1]', true);
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_SERVER_ADDRESS]: '[::1]',
        [ATTR_SERVER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp://[::1]',
        [ATTR_MESSAGING_RABBITMQ_VHOST_NAME]: '/',
      });
    });

    describe('semconv stability', () => {
      it('emits server.* attributes', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user:pass@host:10000/vhost',
          true
        );
        expect(attributes[ATTR_SERVER_ADDRESS]).toEqual('host');
        expect(attributes[ATTR_SERVER_PORT]).toEqual(10000);
      });

      it('emits server.* attributes with url object', () => {
        const attributes = getConnectionAttributesFromUrl(
          {
            protocol: 'amqp',
            hostname: 'testhost',
            port: 5673,
          },
          true
        );
        expect(attributes[ATTR_SERVER_ADDRESS]).toEqual('testhost');
        expect(attributes[ATTR_SERVER_PORT]).toEqual(5673);
      });
    });

    describe('vhost', () => {
      it('defaults to / when not specified on a url object', () => {
        const attributes = getConnectionAttributesFromUrl(
          {
            hostname: 'testhost',
          },
          true
        );
        expect(attributes[ATTR_MESSAGING_RABBITMQ_VHOST_NAME]).toEqual('/');
      });

      it('reads vhost from a url object', () => {
        const attributes = getConnectionAttributesFromUrl(
          {
            hostname: 'testhost',
            vhost: 'my-vhost',
          },
          true
        );
        expect(attributes[ATTR_MESSAGING_RABBITMQ_VHOST_NAME]).toEqual(
          'my-vhost'
        );
      });

      it('percent-decodes vhost from a url object', () => {
        const attributes = getConnectionAttributesFromUrl(
          {
            hostname: 'testhost',
            vhost: '%2f',
          },
          true
        );
        expect(attributes[ATTR_MESSAGING_RABBITMQ_VHOST_NAME]).toEqual('/');
      });
    });

    describe('captureVhostName', () => {
      it('is omitted by default (captureVhostName: false) - string url', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://host/vhost',
          false
        );
        expect(
          attributes[ATTR_MESSAGING_RABBITMQ_VHOST_NAME]
        ).toBeUndefined();
        // unrelated attributes are unaffected
        expect(attributes[ATTR_SERVER_ADDRESS]).toEqual('host');
      });

      it('is omitted by default (captureVhostName: false) - url object', () => {
        const attributes = getConnectionAttributesFromUrl(
          { hostname: 'host', vhost: 'vhost' },
          false
        );
        expect(
          attributes[ATTR_MESSAGING_RABBITMQ_VHOST_NAME]
        ).toBeUndefined();
        expect(attributes[ATTR_SERVER_ADDRESS]).toEqual('host');
      });
    });
  });
});
