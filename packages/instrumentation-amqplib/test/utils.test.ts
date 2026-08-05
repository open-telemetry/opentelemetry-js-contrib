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
import { ATTR_MESSAGING_SYSTEM } from '../src/semconv';
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
        'amqp://user:pass@host:10000/vhost'
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_SERVER_ADDRESS]: 'host',
        [ATTR_SERVER_PORT]: 10000,
        [ATTR_MESSAGING_URL]: 'amqp://user:***@host:10000/vhost',
      });
    });

    it('all features encoded', () => {
      const attributes = getConnectionAttributesFromUrl(
        'amqp://user%61:%61pass@ho%61st:10000/v%2fhost'
      );
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_SERVER_ADDRESS]: 'ho%61st',
        [ATTR_SERVER_PORT]: 10000,
        [ATTR_MESSAGING_URL]: 'amqp://user%61:***@ho%61st:10000/v%2fhost',
      });
    });

    it('only protocol', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://');
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_SERVER_ADDRESS]: 'localhost',
        [ATTR_SERVER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp://',
      });
    });

    it('empty username and password', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://:@/');
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_MESSAGING_URL]: 'amqp://:***@/',
      });
    });

    it('username and no password', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://user@');
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_MESSAGING_URL]: 'amqp://user@',
      });
    });

    it('username and password, no host', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://user:pass@');
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_MESSAGING_URL]: 'amqp://user:***@',
      });
    });

    it('host only', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://host');
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_SERVER_ADDRESS]: 'host',
        [ATTR_SERVER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp://host',
      });
    });

    it('vhost only', () => {
      const attributes = getConnectionAttributesFromUrl('amqp:///vhost');
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_SERVER_ADDRESS]: 'localhost',
        [ATTR_SERVER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp:///vhost',
      });
    });

    it('host only, trailing slash', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://host/');
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_SERVER_ADDRESS]: 'host',
        [ATTR_SERVER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp://host/',
      });
    });

    it('vhost encoded', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://host/%2f');
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_SERVER_ADDRESS]: 'host',
        [ATTR_SERVER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp://host/%2f',
      });
    });

    it('IPv6 host', () => {
      const attributes = getConnectionAttributesFromUrl('amqp://[::1]');
      expect(attributes).toStrictEqual({
        [ATTR_MESSAGING_PROTOCOL]: 'AMQP',
        [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1',
        [ATTR_SERVER_ADDRESS]: '[::1]',
        [ATTR_SERVER_PORT]: 5672,
        [ATTR_MESSAGING_URL]: 'amqp://[::1]',
      });
    });

    describe('semconv stability', () => {
      it('emits server.* attributes', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user:pass@host:10000/vhost'
        );
        expect(attributes[ATTR_SERVER_ADDRESS]).toEqual('host');
        expect(attributes[ATTR_SERVER_PORT]).toEqual(10000);
      });

      it('emits server.* attributes with url object', () => {
        const attributes = getConnectionAttributesFromUrl({
          protocol: 'amqp',
          hostname: 'testhost',
          port: 5673,
        });
        expect(attributes[ATTR_SERVER_ADDRESS]).toEqual('testhost');
        expect(attributes[ATTR_SERVER_PORT]).toEqual(5673);
      });
    });
  });
});
