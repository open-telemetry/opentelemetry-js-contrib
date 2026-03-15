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
import { shouldTest } from './utils';
import {
  rabbitMqUrl,
  TEST_RABBITMQ_HOST,
  TEST_RABBITMQ_PASS,
  TEST_RABBITMQ_PORT,
  TEST_RABBITMQ_USER,
} from './config';
import { AmqplibInstrumentation } from '../src';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';

const instrumentation = registerInstrumentationTesting(
  new AmqplibInstrumentation()
);
registerInstrumentationTesting(new AmqplibInstrumentation());

import * as amqp from 'amqplib';
import {
  ATTR_NETWORK_PEER_ADDRESS,
  ATTR_NETWORK_PEER_PORT,
  ATTR_NETWORK_PROTOCOL_NAME,
  ATTR_NETWORK_PROTOCOL_VERSION,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import { SemconvStability } from '@opentelemetry/instrumentation';
import { ATTR_MESSAGING_SYSTEM } from '@opentelemetry/semantic-conventions/incubating';

describe('amqplib instrumentation connection - stable semconv', () => {
  before(function () {
    instrumentation['_messagingSemconvStability'] = SemconvStability.STABLE;

    if (!shouldTest) {
      this.skip();
    }
  });
  after(async () => {
    instrumentation['_messagingSemconvStability'] = SemconvStability.OLD;
  });

  describe('connect with url object', () => {
    it('should extract connection attributes form url options', async function () {
      const testName = this.test!.title;
      const conn = await amqp.connect({
        protocol: 'amqp',
        username: TEST_RABBITMQ_USER,
        password: TEST_RABBITMQ_PASS,
        hostname: TEST_RABBITMQ_HOST,
        port: TEST_RABBITMQ_PORT,
      });

      try {
        const channel = await conn.createChannel();
        channel.sendToQueue(
          testName,
          Buffer.from('message created only to test connection attributes')
        );
        const [publishSpan] = getTestSpans();

        expect(publishSpan.attributes).toEqual(
          expect.objectContaining({
            [ATTR_MESSAGING_SYSTEM]: 'rabbitmq',
            [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
            [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
            [ATTR_NETWORK_PEER_ADDRESS]: TEST_RABBITMQ_HOST,
            [ATTR_NETWORK_PEER_PORT]: TEST_RABBITMQ_PORT,
            [ATTR_SERVER_ADDRESS]: TEST_RABBITMQ_HOST,
            [ATTR_SERVER_PORT]: TEST_RABBITMQ_PORT,
          })
        );
      } finally {
        await conn.close();
      }
    });

    it('should use default protocol', async function () {
      const testName = this.test!.title;
      const conn = await amqp.connect({
        username: TEST_RABBITMQ_USER,
        password: TEST_RABBITMQ_PASS,
        hostname: TEST_RABBITMQ_HOST,
        port: TEST_RABBITMQ_PORT,
      });

      try {
        const channel = await conn.createChannel();
        channel.sendToQueue(
          testName,
          Buffer.from('message created only to test connection attributes')
        );
        const [publishSpan] = getTestSpans();
        expect(publishSpan.attributes).toEqual(
          expect.objectContaining({
            [ATTR_MESSAGING_SYSTEM]: 'rabbitmq',
            [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
            [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
            [ATTR_NETWORK_PEER_ADDRESS]: TEST_RABBITMQ_HOST,
            [ATTR_NETWORK_PEER_PORT]: TEST_RABBITMQ_PORT,
            [ATTR_SERVER_ADDRESS]: TEST_RABBITMQ_HOST,
            [ATTR_SERVER_PORT]: TEST_RABBITMQ_PORT,
          })
        );
      } finally {
        await conn.close();
      }
    });

    it('should use default host', async function () {
      if (TEST_RABBITMQ_HOST !== 'localhost') {
        return;
      }

      const testName = this.test!.title;
      const conn = await amqp.connect({
        protocol: 'amqp',
        username: TEST_RABBITMQ_USER,
        password: TEST_RABBITMQ_PASS,
        port: TEST_RABBITMQ_PORT,
      });

      try {
        const channel = await conn.createChannel();
        channel.sendToQueue(
          testName,
          Buffer.from('message created only to test connection attributes')
        );
        const [publishSpan] = getTestSpans();
        expect(publishSpan.attributes).toEqual(
          expect.objectContaining({
            [ATTR_MESSAGING_SYSTEM]: 'rabbitmq',
            [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
            [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
            [ATTR_NETWORK_PEER_ADDRESS]: TEST_RABBITMQ_HOST,
            [ATTR_NETWORK_PEER_PORT]: TEST_RABBITMQ_PORT,
            [ATTR_SERVER_ADDRESS]: TEST_RABBITMQ_HOST,
            [ATTR_SERVER_PORT]: TEST_RABBITMQ_PORT,
          })
        );
      } finally {
        await conn.close();
      }
    });
  });

  describe('connect with url string', () => {
    it('should extract connection attributes from url options', async function () {
      const testName = this.test!.title;
      const conn = await amqp.connect(rabbitMqUrl);

      try {
        const msgPayload = Buffer.from(
          'message created only to test connection attributes'
        );

        const channel = await conn.createChannel();
        channel.sendToQueue(testName, msgPayload);
        const [publishSpan] = getTestSpans();

        expect(publishSpan.attributes).toEqual(
          expect.objectContaining({
            [ATTR_MESSAGING_SYSTEM]: 'rabbitmq',
            [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
            [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
            [ATTR_NETWORK_PEER_ADDRESS]: TEST_RABBITMQ_HOST,
            [ATTR_NETWORK_PEER_PORT]: TEST_RABBITMQ_PORT,
            [ATTR_SERVER_ADDRESS]: TEST_RABBITMQ_HOST,
            [ATTR_SERVER_PORT]: TEST_RABBITMQ_PORT,
          })
        );
      } finally {
        await conn.close();
      }
    });
  });
});
