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

import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  SpanKind,
} from '@opentelemetry/api';
import * as assert from 'assert';
import Instrumentation from '../src';
import * as testUtils from '@opentelemetry/contrib-test-utils';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type * as Pulsar from 'pulsar-client';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

registerInstrumentationTesting(new Instrumentation());

const CONFIG = {
  host: process.env.OPENTELEMETRY_PULSAR_HOST || 'localhost',
  port: process.env.OPENTELEMETRY_PULSAR_PORT || '6650',
};

const getClient = (config: Pulsar.ClientConfig): Pulsar.Client => {
  const pulsar = require('pulsar-client');
  return new pulsar.Client(config);
};

const shouldTestLocal = process.env.RUN_PULSAR_TESTS_LOCAL;
const shouldTest = process.env.RUN_PULSAR_TESTS || shouldTestLocal;

describe('pulsar@1.7.x', () => {
  before(function () {
    // needs to be "function" to have MochaContext "this" context
    if (!shouldTest) {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    }

    if (shouldTestLocal) {
      testUtils.startDocker('pulsar');
    }
  });

  after(() => {
    if (shouldTestLocal) {
      testUtils.cleanUpDocker('pulsar');
    }
  });

  describe('default config', () => {
    let client: Pulsar.Client;
    let topic: string;

    beforeEach(function () {
      client = getClient({
        serviceUrl: `pulsar://${CONFIG.host}:${CONFIG.port}`,
      });
      const title = this.currentTest
        ?.fullTitle()
        .replace(/\W/g, '')
        .toLowerCase();
      topic = `${title}-${Math.random()}`;
    });

    afterEach(() => {
      client.close();
    });

    async function getProducer() {
      return await client.createProducer({
        topic,
      });
    }

    const sampleMessage = {
      data: Buffer.from('produced message'),
    };

    it('should produce message', async () => {
      const producer = await getProducer();
      const messageId = await producer.send(sampleMessage);
      assert.ok(messageId);

      const [produceSpan] = getTestSpans();

      assert.equal(produceSpan.kind, SpanKind.PRODUCER);
      assert.equal(produceSpan.name, 'send');
      assert.equal(produceSpan.attributes['pulsar.version'], '1.7.0');
      assert.equal(
        produceSpan.attributes[SemanticAttributes.MESSAGING_DESTINATION],
        topic
      );
    });

    it('should receive message', async () => {
      const producer = await getProducer();
      const messageId = await producer.send(sampleMessage);
      assert.ok(messageId);

      const consumer = await client.subscribe({
        topic,
        subscription: 'test-receive-message',
        subscriptionInitialPosition: 'Earliest',
      });

      const receivedMessage = await consumer.receive();
      assert.deepEqual(receivedMessage.getData(), sampleMessage.data);

      // force the span to be released
      await consumer.close();

      const [produceSpan, receiveSpan] = getTestSpans();

      // The receiveSpan gets the parent
      assert.equal(
        produceSpan.spanContext().traceId,
        receiveSpan.spanContext().traceId
      );
    });

    it('should consume message with callbacks', async () => {
      const producer = await getProducer();
      const messageId = await producer.send(sampleMessage);
      assert.ok(messageId);

      let doneWithMessage: (
        value: PromiseLike<Pulsar.Message> | Pulsar.Message
      ) => void;
      const receivedMessagePromise = new Promise<Pulsar.Message>(
        (resolve, _) => {
          console.log(`Initialized with ${resolve}`);
          doneWithMessage = resolve;
        }
      );

      await client.subscribe({
        topic,
        subscription: 'test-receive-message',
        subscriptionInitialPosition: 'Earliest',
        listener: (message, consumer) => {
          doneWithMessage(message);
          consumer.close();
        },
      });

      const receivedMessage = await receivedMessagePromise;
      assert.ok(receivedMessage);

      assert.deepEqual(receivedMessage?.getData(), sampleMessage.data);
      let spans: any[] = [];
      for (let i = 0; i < 10; i++) {
        spans = getTestSpans();
        if (spans.length == 1) {
          // This means that the await in the wrapped function signed the node executor that it is waiting for something
          // and the messaged is resolved before the wrapped listener finished as it awaits the callback and then on finally
          // ends the span
          await new Promise((resolve, _) => setTimeout(resolve, 100));
          spans = getTestSpans();
        }
      }
      if (spans.length < 2) {
        throw new Error('Receive span was never ended');
      }

      const [produceSpan, receiveSpan] = spans;

      // The receiveSpan gets the parent
      assert.equal(
        produceSpan.spanContext().traceId,
        receiveSpan.spanContext().traceId
      );
    });
  });
});
