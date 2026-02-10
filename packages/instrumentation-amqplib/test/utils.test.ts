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
  getConsumeAttributes,
  getPublishAttributes,
  getPublishSpanName,
} from '../src/utils';
import {
  ATTR_NETWORK_PROTOCOL_NAME,
  ATTR_NETWORK_PROTOCOL_VERSION,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_MESSAGING_OPERATION,
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
  MESSAGING_OPERATION_VALUE_PROCESS,
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
  ATTR_MESSAGING_RABBITMQ_MESSAGE_DELIVERY_TAG,
  MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
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

  describe('getPublishSpanName', () => {
    it('should return the exchange name', () => {
      expect(
        getPublishSpanName('test-exchange', 'routing.key', SemconvStability.OLD)
      ).toBe('publish test-exchange');
    });

    it('should handle empty exchange as <default>', () => {
      expect(getPublishSpanName('', 'routing.key', SemconvStability.OLD)).toBe(
        'publish <default>'
      );
    });

    it('should handle special characters in exchange name', () => {
      expect(
        getPublishSpanName(
          'exchange.with-special_chars',
          'routing.key',
          SemconvStability.OLD
        )
      ).toBe('publish exchange.with-special_chars');
    });

    it('should handle long exchange names', () => {
      expect(
        getPublishSpanName(
          'very-long-exchange-name-with-many-characters',
          'routing.key',
          SemconvStability.OLD
        )
      ).toBe('publish very-long-exchange-name-with-many-characters');
    });

    it('should ignore the routing key value', () => {
      expect(
        getPublishSpanName(
          'test-exchange',
          'different.routing.key',
          SemconvStability.OLD
        )
      ).toBe('publish test-exchange');
    });

    describe('messaging semconv stability', () => {
      describe('Stable attributes', () => {
        it('should return exchange:routingKey when both are present', () => {
          expect(
            getPublishSpanName(
              'test-exchange',
              'routing.key',
              SemconvStability.STABLE
            )
          ).toBe('publish test-exchange:routing.key');
        });

        it('should return only exchange when routing key is empty', () => {
          expect(
            getPublishSpanName('test-exchange', '', SemconvStability.STABLE)
          ).toBe('publish test-exchange');
        });

        it('should return only routing key when exchange is empty', () => {
          expect(
            getPublishSpanName('', 'routing.key', SemconvStability.STABLE)
          ).toBe('publish routing.key');
        });

        it('should use amq.default when both are empty', () => {
          expect(getPublishSpanName('', '', SemconvStability.STABLE)).toBe(
            'publish amq.default'
          );
        });

        it('should handle dots in exchange and routing key', () => {
          expect(
            getPublishSpanName(
              'app.service.exchange',
              'user.created.event',
              SemconvStability.STABLE
            )
          ).toBe('publish app.service.exchange:user.created.event');
        });

        it('should handle special characters', () => {
          expect(
            getPublishSpanName(
              'exchange-with_special.chars',
              'routing.key-with_special.chars',
              SemconvStability.STABLE
            )
          ).toBe(
            'publish exchange-with_special.chars:routing.key-with_special.chars'
          );
        });
      });

      describe('Both old and stable attributes', () => {
        it('should use stable format when both flags are set', () => {
          expect(
            getPublishSpanName(
              'test-exchange',
              'routing.key',
              SemconvStability.DUPLICATE
            )
          ).toBe('publish test-exchange:routing.key');
        });

        it('should prioritize stable format over old format', () => {
          const spanName = getPublishSpanName(
            'my-exchange',
            'my.key',
            SemconvStability.DUPLICATE
          );
          expect(spanName).toBe('publish my-exchange:my.key');
          expect(spanName).not.toBe('publish my-exchange');
        });

        it('should use stable default when both are empty', () => {
          const spanName = getPublishSpanName(
            '',
            '',
            SemconvStability.DUPLICATE
          );
          expect(spanName).toBe('publish amq.default');
          expect(spanName).not.toBe('publish <default>');
        });
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

  describe('getConsumeAttributes', () => {
    it('should return minimal attributes', () => {
      const msg = {} as amqp.ConsumeMessage;
      expect(
        getConsumeAttributes('queue-name', msg, SemconvStability.OLD)
      ).toStrictEqual({
        [ATTR_MESSAGING_DESTINATION]: undefined,
        [ATTR_MESSAGING_DESTINATION_KIND]:
          MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
        [ATTR_MESSAGING_OPERATION]: MESSAGING_OPERATION_VALUE_PROCESS,
        [ATTR_MESSAGING_RABBITMQ_ROUTING_KEY]: undefined,
        [OLD_ATTR_MESSAGING_MESSAGE_ID]: undefined,
        [ATTR_MESSAGING_CONVERSATION_ID]: undefined,
      });
    });

    it('should return all consume attributes from fields/properties', () => {
      const msg = {
        fields: {
          exchange: 'test-exchange',
          routingKey: 'routing.key',
          deliveryTag: 2,
        },
        properties: {
          messageId: 'msg-123',
          correlationId: 'corr-456',
        },
        content: Buffer.from('test message with properties'),
      } as amqp.ConsumeMessage;
      expect(
        getConsumeAttributes('queue-name', msg, SemconvStability.OLD)
      ).toStrictEqual({
        [ATTR_MESSAGING_DESTINATION]: 'test-exchange',
        [ATTR_MESSAGING_DESTINATION_KIND]:
          MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
        [ATTR_MESSAGING_OPERATION]: MESSAGING_OPERATION_VALUE_PROCESS,
        [ATTR_MESSAGING_RABBITMQ_ROUTING_KEY]: 'routing.key',
        [OLD_ATTR_MESSAGING_MESSAGE_ID]: 'msg-123',
        [ATTR_MESSAGING_CONVERSATION_ID]: 'corr-456',
      });
    });

    describe('messaging semconv stability', () => {
      describe('Stable attributes', () => {
        it('should return minimal stable attributes', () => {
          const msg = {} as amqp.ConsumeMessage;
          expect(
            getConsumeAttributes('', msg, SemconvStability.STABLE)
          ).toStrictEqual({
            [ATTR_MESSAGING_OPERATION_TYPE]:
              MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
            [ATTR_MESSAGING_OPERATION_NAME]: 'consume',
            [ATTR_MESSAGING_DESTINATION_NAME]: 'amq.default',
            [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: undefined,
            [ATTR_MESSAGING_RABBITMQ_MESSAGE_DELIVERY_TAG]: undefined,
            [ATTR_MESSAGING_MESSAGE_ID]: undefined,
            [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: undefined,
            [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: undefined,
          });
        });

        it('should return all consume attributes from fields/properties', () => {
          const msg = {
            fields: {
              exchange: 'test-exchange',
              routingKey: 'routing.key',
              deliveryTag: 2,
            },
            properties: {
              messageId: 'msg-123',
              correlationId: 'corr-456',
            },
            content: Buffer.from('test message with properties'),
          } as amqp.ConsumeMessage;
          expect(
            getConsumeAttributes('queue-name', msg, SemconvStability.STABLE)
          ).toStrictEqual({
            [ATTR_MESSAGING_OPERATION_TYPE]:
              MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
            [ATTR_MESSAGING_OPERATION_NAME]: 'consume',
            [ATTR_MESSAGING_DESTINATION_NAME]:
              'test-exchange:routing.key:queue-name',
            [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: 'routing.key',
            [ATTR_MESSAGING_RABBITMQ_MESSAGE_DELIVERY_TAG]: 2,
            [ATTR_MESSAGING_MESSAGE_ID]: 'msg-123',
            [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: 'corr-456',
            [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: 28,
          });
        });

        it('should use exchange:routingKey when queue == routingKey', () => {
          const msg = {
            fields: {
              exchange: 'test-exchange',
              routingKey: 'queue-name',
              deliveryTag: 1,
            },
            properties: {},
            content: Buffer.from('test'),
          } as amqp.ConsumeMessage;
          const attrs = getConsumeAttributes(
            'queue-name',
            msg,
            SemconvStability.STABLE
          );
          expect(attrs[ATTR_MESSAGING_DESTINATION_NAME]).toBe(
            'test-exchange:queue-name'
          );
        });

        it('should use exchange:routingKey:queue when all different', () => {
          const msg = {
            fields: {
              exchange: 'test-exchange',
              routingKey: 'routing.key',
              deliveryTag: 1,
            },
            properties: {},
            content: Buffer.from('test'),
          } as amqp.ConsumeMessage;
          const attrs = getConsumeAttributes(
            'different-queue',
            msg,
            SemconvStability.STABLE
          );
          expect(attrs[ATTR_MESSAGING_DESTINATION_NAME]).toBe(
            'test-exchange:routing.key:different-queue'
          );
        });

        it('should use exchange:routingKey when queue is missing', () => {
          const msg = {
            fields: {
              exchange: 'test-exchange',
              routingKey: 'routing.key',
              deliveryTag: 1,
            },
            properties: {},
            content: Buffer.from('test'),
          } as amqp.ConsumeMessage;
          const attrs = getConsumeAttributes('', msg, SemconvStability.STABLE);
          expect(attrs[ATTR_MESSAGING_DESTINATION_NAME]).toBe(
            'test-exchange:routing.key'
          );
        });

        it('should use exchange:queue when routingKey is missing', () => {
          const msg = {
            fields: {
              exchange: 'test-exchange',
              routingKey: '',
              deliveryTag: 1,
            },
            properties: {},
            content: Buffer.from('test'),
          } as amqp.ConsumeMessage;
          const attrs = getConsumeAttributes(
            'test-queue',
            msg,
            SemconvStability.STABLE
          );
          expect(attrs[ATTR_MESSAGING_DESTINATION_NAME]).toBe(
            'test-exchange:test-queue'
          );
        });

        it('should use routingKey:queue when exchange is empty', () => {
          const msg = {
            fields: { exchange: '', routingKey: 'routing.key', deliveryTag: 1 },
            properties: {},
            content: Buffer.from('test'),
          } as amqp.ConsumeMessage;
          const attrs = getConsumeAttributes(
            'test-queue',
            msg,
            SemconvStability.STABLE
          );
          expect(attrs[ATTR_MESSAGING_DESTINATION_NAME]).toBe(
            'routing.key:test-queue'
          );
        });

        it('should use only exchange if only exchange is present', () => {
          const msg = {
            fields: {
              exchange: 'test-exchange',
              routingKey: '',
              deliveryTag: 1,
            },
            properties: {},
            content: Buffer.from('test'),
          } as amqp.ConsumeMessage;
          const attrs = getConsumeAttributes('', msg, SemconvStability.STABLE);
          expect(attrs[ATTR_MESSAGING_DESTINATION_NAME]).toBe('test-exchange');
        });

        it('should use only routingKey if only routingKey is present', () => {
          const msg = {
            fields: { exchange: '', routingKey: 'routing.key', deliveryTag: 1 },
            properties: {},
            content: Buffer.from('test'),
          } as amqp.ConsumeMessage;
          const attrs = getConsumeAttributes('', msg, SemconvStability.STABLE);
          expect(attrs[ATTR_MESSAGING_DESTINATION_NAME]).toBe('routing.key');
        });

        it('should use only queue if only queue is present', () => {
          const msg = {
            fields: { exchange: '', routingKey: '', deliveryTag: 1 },
            properties: {},
            content: Buffer.from('test'),
          } as amqp.ConsumeMessage;
          const attrs = getConsumeAttributes(
            'test-queue',
            msg,
            SemconvStability.STABLE
          );
          expect(attrs[ATTR_MESSAGING_DESTINATION_NAME]).toBe('test-queue');
        });

        it('should use amq.default if all are empty', () => {
          const msg = {
            fields: { exchange: '', routingKey: '', deliveryTag: 1 },
            properties: {},
            content: Buffer.from('test'),
          } as amqp.ConsumeMessage;
          const attrs = getConsumeAttributes('', msg, SemconvStability.STABLE);
          expect(attrs[ATTR_MESSAGING_DESTINATION_NAME]).toBe('amq.default');
        });
      });

      describe('Both old and stable attributes', () => {
        it('should combine minimal attributes', () => {
          const msg = {} as amqp.ConsumeMessage;
          expect(
            getConsumeAttributes('', msg, SemconvStability.DUPLICATE)
          ).toStrictEqual({
            [ATTR_MESSAGING_DESTINATION]: undefined,
            [ATTR_MESSAGING_DESTINATION_KIND]:
              MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
            [ATTR_MESSAGING_OPERATION]: MESSAGING_OPERATION_VALUE_PROCESS,
            [ATTR_MESSAGING_RABBITMQ_ROUTING_KEY]: undefined,
            [OLD_ATTR_MESSAGING_MESSAGE_ID]: undefined,
            [ATTR_MESSAGING_CONVERSATION_ID]: undefined,
            [ATTR_MESSAGING_OPERATION_TYPE]:
              MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
            [ATTR_MESSAGING_OPERATION_NAME]: 'consume',
            [ATTR_MESSAGING_DESTINATION_NAME]: 'amq.default',
            [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: undefined,
            [ATTR_MESSAGING_RABBITMQ_MESSAGE_DELIVERY_TAG]: undefined,
            [ATTR_MESSAGING_MESSAGE_ID]: undefined,
            [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: undefined,
            [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: undefined,
          });
        });

        it('should combine all options', () => {
          const msg = {
            fields: {
              exchange: 'test-exchange',
              routingKey: 'routing.key',
              deliveryTag: 1,
            },
            properties: {
              messageId: 'msg-123',
              correlationId: 'corr-456',
            },
            content: Buffer.from('complete test message'),
          } as amqp.ConsumeMessage;
          expect(
            getConsumeAttributes('queue-name', msg, SemconvStability.DUPLICATE)
          ).toStrictEqual({
            [ATTR_MESSAGING_DESTINATION]: 'test-exchange',
            [ATTR_MESSAGING_DESTINATION_KIND]:
              MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
            [ATTR_MESSAGING_OPERATION]: MESSAGING_OPERATION_VALUE_PROCESS,
            [ATTR_MESSAGING_RABBITMQ_ROUTING_KEY]: 'routing.key',
            [OLD_ATTR_MESSAGING_MESSAGE_ID]: 'msg-123',
            [ATTR_MESSAGING_CONVERSATION_ID]: 'corr-456',
            [ATTR_MESSAGING_OPERATION_TYPE]:
              MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
            [ATTR_MESSAGING_OPERATION_NAME]: 'consume',
            [ATTR_MESSAGING_DESTINATION_NAME]:
              'test-exchange:routing.key:queue-name',
            [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: 'routing.key',
            [ATTR_MESSAGING_RABBITMQ_MESSAGE_DELIVERY_TAG]: 1,
            [ATTR_MESSAGING_MESSAGE_ID]: 'msg-123',
            [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: 'corr-456',
            [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: 21,
          });
        });
      });
    });
  });
});
