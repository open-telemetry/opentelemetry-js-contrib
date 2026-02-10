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
  getPublishAttributes,
} from '../src/utils';
import {
  ATTR_NETWORK_PROTOCOL_NAME,
  ATTR_NETWORK_PROTOCOL_VERSION,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_MESSAGING_SYSTEM,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
} from '../src/semconv';
import {
  ATTR_MESSAGING_CONVERSATION_ID,
  ATTR_MESSAGING_DESTINATION,
  ATTR_MESSAGING_DESTINATION_KIND,
  ATTR_MESSAGING_PROTOCOL,
  ATTR_MESSAGING_PROTOCOL_VERSION,
  ATTR_MESSAGING_RABBITMQ_ROUTING_KEY,
  ATTR_MESSAGING_URL,
  MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
  OLD_ATTR_MESSAGING_MESSAGE_ID,
} from '../src/semconv-obsolete';
import * as amqp from 'amqplib';
import { shouldTest } from './utils';
import { rabbitMqUrl } from './config';
import {
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_MESSAGE_BODY_SIZE,
  ATTR_MESSAGING_MESSAGE_CONVERSATION_ID,
  ATTR_MESSAGING_MESSAGE_ID,
  ATTR_MESSAGING_OPERATION_NAME,
  ATTR_MESSAGING_OPERATION_TYPE,
  ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY,
} from '@opentelemetry/semantic-conventions/incubating';

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
        SemconvStability.OLD,
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
        SemconvStability.OLD,
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
        SemconvStability.OLD,
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
        SemconvStability.OLD,
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
        SemconvStability.OLD,
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
        SemconvStability.OLD,
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
        SemconvStability.OLD,
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
        SemconvStability.OLD,
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
        SemconvStability.OLD,
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
        SemconvStability.OLD,
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
        SemconvStability.OLD,
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

    describe('net semconv stability', () => {
      it('OLD semconv emits net.peer.* attributes', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user:pass@host:10000/vhost',
          SemconvStability.OLD,
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
          SemconvStability.STABLE,
          SemconvStability.OLD
        );
        expect(attributes[ATTR_NET_PEER_NAME]).toBeUndefined();
        expect(attributes[ATTR_NET_PEER_PORT]).toBeUndefined();
        expect(attributes[ATTR_SERVER_ADDRESS]).toEqual('host');
        expect(attributes[ATTR_SERVER_PORT]).toEqual(10000);
      });

      it('DUPLICATE semconv emits both old and stable attributes', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user:pass@host:10000/vhost',
          SemconvStability.DUPLICATE,
          SemconvStability.OLD
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
          SemconvStability.OLD,
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
          SemconvStability.STABLE,
          SemconvStability.OLD
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
          SemconvStability.DUPLICATE,
          SemconvStability.OLD
        );
        expect(attributes[ATTR_NET_PEER_NAME]).toEqual('testhost');
        expect(attributes[ATTR_NET_PEER_PORT]).toEqual(5673);
        expect(attributes[ATTR_SERVER_ADDRESS]).toEqual('testhost');
        expect(attributes[ATTR_SERVER_PORT]).toEqual(5673);
      });
    });

    describe('messaging semconv stability', () => {
      it('OLD semconv emits messaging.* attributes', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user:pass@host:10000/vhost',
          SemconvStability.OLD,
          SemconvStability.OLD
        );
        expect(attributes[ATTR_MESSAGING_PROTOCOL]).toEqual('AMQP');
        expect(attributes[ATTR_MESSAGING_PROTOCOL_VERSION]).toEqual('0.9.1');
        expect(attributes[ATTR_NETWORK_PROTOCOL_NAME]).toBeUndefined();
        expect(attributes[ATTR_NETWORK_PROTOCOL_VERSION]).toBeUndefined();
      });

      it('STABLE semconv emits network.protocol.* attributes', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user:pass@host:10000/vhost',
          SemconvStability.OLD,
          SemconvStability.STABLE
        );
        expect(attributes[ATTR_MESSAGING_PROTOCOL]).toBeUndefined();
        expect(attributes[ATTR_MESSAGING_PROTOCOL_VERSION]).toBeUndefined();
        expect(attributes[ATTR_NETWORK_PROTOCOL_NAME]).toEqual('AMQP');
        expect(attributes[ATTR_NETWORK_PROTOCOL_VERSION]).toEqual('0.9.1');
      });

      it('DUPLICATE semconv emits both old and stable attributes', () => {
        const attributes = getConnectionAttributesFromUrl(
          'amqp://user:pass@host:10000/vhost',
          SemconvStability.OLD,
          SemconvStability.DUPLICATE
        );
        expect(attributes[ATTR_MESSAGING_PROTOCOL]).toEqual('AMQP');
        expect(attributes[ATTR_MESSAGING_PROTOCOL_VERSION]).toEqual('0.9.1');
        expect(attributes[ATTR_NETWORK_PROTOCOL_NAME]).toEqual('AMQP');
        expect(attributes[ATTR_NETWORK_PROTOCOL_VERSION]).toEqual('0.9.1');
      });
    });
  });

  describe('getPublishAttributes', () => {
    it('should return minimal attributes', () => {
      expect(
        getPublishAttributes(
          'test-exchange',
          'routing.key',
          1024,
          {},
          SemconvStability.OLD
        )
      ).toStrictEqual({
        [ATTR_MESSAGING_DESTINATION]: 'test-exchange',
        [ATTR_MESSAGING_DESTINATION_KIND]:
          MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
        [ATTR_MESSAGING_RABBITMQ_ROUTING_KEY]: 'routing.key',
        [OLD_ATTR_MESSAGING_MESSAGE_ID]: undefined,
        [ATTR_MESSAGING_CONVERSATION_ID]: undefined,
      });
    });

    it('should support messageId and correlationId', () => {
      expect(
        getPublishAttributes(
          'test-exchange',
          'routing.key',
          2048,
          { messageId: 'msg-123', correlationId: 'corr-456' },
          SemconvStability.OLD
        )
      ).toStrictEqual({
        [ATTR_MESSAGING_DESTINATION]: 'test-exchange',
        [ATTR_MESSAGING_DESTINATION_KIND]:
          MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
        [ATTR_MESSAGING_RABBITMQ_ROUTING_KEY]: 'routing.key',
        [OLD_ATTR_MESSAGING_MESSAGE_ID]: 'msg-123',
        [ATTR_MESSAGING_CONVERSATION_ID]: 'corr-456',
      });
    });

    it('should handle empty exchange', () => {
      expect(
        getPublishAttributes('', 'routing.key', 512, {}, SemconvStability.OLD)
      ).toStrictEqual({
        [ATTR_MESSAGING_DESTINATION]: '',
        [ATTR_MESSAGING_DESTINATION_KIND]:
          MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
        [ATTR_MESSAGING_RABBITMQ_ROUTING_KEY]: 'routing.key',
        [OLD_ATTR_MESSAGING_MESSAGE_ID]: undefined,
        [ATTR_MESSAGING_CONVERSATION_ID]: undefined,
      });
    });

    it('should handle empty routing key', () => {
      expect(
        getPublishAttributes('test-exchange', '', 256, {}, SemconvStability.OLD)
      ).toStrictEqual({
        [ATTR_MESSAGING_DESTINATION]: 'test-exchange',
        [ATTR_MESSAGING_DESTINATION_KIND]:
          MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
        [ATTR_MESSAGING_RABBITMQ_ROUTING_KEY]: '',
        [OLD_ATTR_MESSAGING_MESSAGE_ID]: undefined,
        [ATTR_MESSAGING_CONVERSATION_ID]: undefined,
      });
    });

    it('should handle special characters', () => {
      expect(
        getPublishAttributes(
          'test.exchange-with_special.chars',
          'routing.key.with-special_chars',
          100,
          { messageId: 'special-chars-msg' },
          SemconvStability.OLD
        )
      ).toStrictEqual({
        [ATTR_MESSAGING_DESTINATION]: 'test.exchange-with_special.chars',
        [ATTR_MESSAGING_DESTINATION_KIND]:
          MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
        [ATTR_MESSAGING_RABBITMQ_ROUTING_KEY]: 'routing.key.with-special_chars',
        [OLD_ATTR_MESSAGING_MESSAGE_ID]: 'special-chars-msg',
        [ATTR_MESSAGING_CONVERSATION_ID]: undefined,
      });
    });

    describe('messaging semconv stability', () => {
      describe('Stable attributes', () => {
        it('should return minimal attributes', () => {
          expect(
            getPublishAttributes(
              'test-exchange',
              'routing.key',
              1024,
              {},
              SemconvStability.STABLE
            )
          ).toStrictEqual({
            [ATTR_MESSAGING_OPERATION_TYPE]: 'send',
            [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
            [ATTR_MESSAGING_DESTINATION_NAME]: 'test-exchange:routing.key',
            [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: 'routing.key',
            [ATTR_MESSAGING_MESSAGE_ID]: undefined,
            [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: undefined,
            [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: 1024,
          });
        });

        it('should support messageId and correlationId', () => {
          expect(
            getPublishAttributes(
              'test-exchange',
              'routing.key',
              2048,
              { messageId: 'msg-123', correlationId: 'corr-456' },
              SemconvStability.STABLE
            )
          ).toStrictEqual({
            [ATTR_MESSAGING_OPERATION_TYPE]: 'send',
            [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
            [ATTR_MESSAGING_DESTINATION_NAME]: 'test-exchange:routing.key',
            [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: 'routing.key',
            [ATTR_MESSAGING_MESSAGE_ID]: 'msg-123',
            [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: 'corr-456',
            [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: 2048,
          });
        });

        it('should handle empty exchange', () => {
          expect(
            getPublishAttributes(
              '',
              'routing.key',
              512,
              {},
              SemconvStability.STABLE
            )
          ).toStrictEqual({
            [ATTR_MESSAGING_OPERATION_TYPE]: 'send',
            [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
            [ATTR_MESSAGING_DESTINATION_NAME]: 'routing.key',
            [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: 'routing.key',
            [ATTR_MESSAGING_MESSAGE_ID]: undefined,
            [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: undefined,
            [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: 512,
          });
        });

        it('should handle empty routing key', () => {
          expect(
            getPublishAttributes(
              'test-exchange',
              '',
              256,
              {},
              SemconvStability.STABLE
            )
          ).toStrictEqual({
            [ATTR_MESSAGING_OPERATION_TYPE]: 'send',
            [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
            [ATTR_MESSAGING_DESTINATION_NAME]: 'test-exchange',
            [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: '',
            [ATTR_MESSAGING_MESSAGE_ID]: undefined,
            [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: undefined,
            [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: 256,
          });
        });

        it('should handle zero content length', () => {
          expect(
            getPublishAttributes(
              'test-exchange',
              'routing.key',
              0,
              {},
              SemconvStability.STABLE
            )
          ).toStrictEqual({
            [ATTR_MESSAGING_OPERATION_TYPE]: 'send',
            [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
            [ATTR_MESSAGING_DESTINATION_NAME]: 'test-exchange:routing.key',
            [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: 'routing.key',
            [ATTR_MESSAGING_MESSAGE_ID]: undefined,
            [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: undefined,
            [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: 0,
          });
        });
      });

      describe('Both old and stable attributes', () => {
        it('should combine minimal attributes', () => {
          expect(
            getPublishAttributes(
              'exchange',
              '',
              256,
              {},
              SemconvStability.DUPLICATE
            )
          ).toStrictEqual({
            [ATTR_MESSAGING_DESTINATION]: 'exchange',
            [ATTR_MESSAGING_DESTINATION_KIND]:
              MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
            [ATTR_MESSAGING_RABBITMQ_ROUTING_KEY]: '',
            [OLD_ATTR_MESSAGING_MESSAGE_ID]: undefined,
            [ATTR_MESSAGING_CONVERSATION_ID]: undefined,
            [ATTR_MESSAGING_OPERATION_TYPE]: 'send',
            [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
            [ATTR_MESSAGING_DESTINATION_NAME]: 'exchange',
            [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: '',
            [ATTR_MESSAGING_MESSAGE_ID]: undefined,
            [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: undefined,
            [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: 256,
          });
        });

        it('should combine with all options', () => {
          expect(
            getPublishAttributes(
              'test-exchange',
              'routing.key',
              1024,
              { messageId: 'msg-123', correlationId: 'corr-456' },
              SemconvStability.DUPLICATE
            )
          ).toStrictEqual({
            [ATTR_MESSAGING_DESTINATION]: 'test-exchange',
            [ATTR_MESSAGING_DESTINATION_KIND]:
              MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
            [ATTR_MESSAGING_RABBITMQ_ROUTING_KEY]: 'routing.key',
            [OLD_ATTR_MESSAGING_MESSAGE_ID]: 'msg-123',
            [ATTR_MESSAGING_CONVERSATION_ID]: 'corr-456',
            [ATTR_MESSAGING_OPERATION_TYPE]: 'send',
            [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
            [ATTR_MESSAGING_DESTINATION_NAME]: 'test-exchange:routing.key',
            [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: 'routing.key',
            [ATTR_MESSAGING_MESSAGE_ID]: 'msg-123',
            [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: 'corr-456',
            [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: 1024,
          });
        });
      });
    });
  });
});
