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
import type * as Pulsar from 'pulsar-client';
import type {ConsumerConfig} from 'pulsar-client';
import * as api from '@opentelemetry/api';
import {Attributes, Span, SpanStatusCode, Tracer} from '@opentelemetry/api';
import {Instrumentation} from '../instrumentation';
import {SemanticAttributes} from "@opentelemetry/semantic-conventions";
import {PulsarInstrumentationConfig} from "../types";

const spanNames = {
  beforeConsume: 'beforeConsume',
  afterConsume: 'afterConsume',
};

type ConsumerListener = (
  message: Pulsar.Message,
  consumer: Pulsar.Consumer
) => void | Promise<void>;

export class ConsumerProxy implements Pulsar.Consumer {
  private readonly _tracer: Tracer;
  private readonly _instrumentationConfig: PulsarInstrumentationConfig;
  private readonly _moduleVersion: string | undefined;
  private readonly config: Pulsar.ConsumerConfig;
  private consumer: Pulsar.Consumer;

  private _lastSpan: Span | undefined;
  private _lastAttributes: Attributes | undefined;

  constructor(
    _tracer: Tracer,
    _instrumentationConfig: PulsarInstrumentationConfig,
    _moduleVersion: string | undefined,
    config: Pulsar.ConsumerConfig,
    consumer: Pulsar.Consumer
  ) {
    this._tracer = _tracer;
    this._instrumentationConfig = _instrumentationConfig;
    this._moduleVersion = _moduleVersion;
    this.config = config;
    this.consumer = consumer;
  }

  async receive(timeout?: number): Promise<Pulsar.Message> {
    this.closePreviousSpan();
    const message = await this.consumer.receive(timeout);

    // Postpone the span ending for the next time the user calls receive
    this._lastSpan = extractSpanFromMessage(
      this._tracer,
      this._instrumentationConfig,
      this._moduleVersion,
      this.config,
      message
    );
    this._lastAttributes = getAttributesFromMessage(message);
    return message;
  }

  private closePreviousSpan() {
    // User is done with the last message and called receive again.
    if (this._lastSpan) {
      this._lastSpan.end();
      if (this._instrumentationConfig.trackBeforeAndAfterConsume) {
        trackBeforeAndAfterConsume(this._tracer, spanNames.afterConsume, this._lastAttributes!);
      }
    }
  }

  acknowledge(message: Pulsar.Message): Promise<null> {
    this.closePreviousSpan();
    return this.consumer.acknowledge(message);
  }

  acknowledgeId(messageId: Pulsar.MessageId): Promise<null> {
    this.closePreviousSpan();
    return this.consumer.acknowledgeId(messageId);
  }

  negativeAcknowledge(message: Pulsar.Message): void {
    this.closePreviousSpan();
    this.consumer.negativeAcknowledge(message);
  }

  negativeAcknowledgeId(messageId: Pulsar.MessageId): void {
    this.closePreviousSpan();
    this.consumer.negativeAcknowledgeId(messageId);
  }

  acknowledgeCumulative(message: Pulsar.Message): Promise<null> {
    this.closePreviousSpan();
    return this.consumer.acknowledgeCumulative(message);
  }

  acknowledgeCumulativeId(messageId: Pulsar.MessageId): Promise<null> {
    this.closePreviousSpan();
    return this.consumer.acknowledgeCumulativeId(messageId);
  }

  isConnected(): boolean {
    return this.consumer.isConnected();
  }

  close(): Promise<null> {
    this.closePreviousSpan();
    return this.consumer.close();
  }

  unsubscribe(): Promise<null> {
    this.closePreviousSpan();
    return this.consumer.unsubscribe();
  }
}

function trackBeforeAndAfterConsume(tracer: Tracer, spanName: string, extraAttributes: Attributes) {
  tracer.startActiveSpan(spanName, {attributes: extraAttributes}, span => {
    span.end()
  });
}

function getAttributesFromMessage(message: Pulsar.Message) {
  return {
    [SemanticAttributes.MESSAGING_DESTINATION]: message.getTopicName(),
    [SemanticAttributes.MESSAGING_MESSAGE_ID]: message.getMessageId().toString(),
  };
}

function extractSpanFromMessage(
  tracer: api.Tracer,
  instrumentationConfig: PulsarInstrumentationConfig,
  moduleVersion: string | undefined,
  config: Pulsar.ConsumerConfig,
  message: Pulsar.Message
) {
  const remoteContext = api.propagation.extract(
    api.context.active(),
    message.getProperties()
  );

  const extraAttributes = getAttributesFromMessage(message);
  if (instrumentationConfig.trackBeforeAndAfterConsume) {
    trackBeforeAndAfterConsume(tracer, spanNames.beforeConsume, extraAttributes);
  }

  const span = tracer.startSpan(
    'receive',
    {
      kind: api.SpanKind.CONSUMER,
      attributes: {
        'pulsar.version': moduleVersion,
        ...extraAttributes,
        ...Instrumentation.COMMON_ATTRIBUTES,
      },
    },
    remoteContext
  );

  api.trace.setSpan(remoteContext, span);

  return span;
}

export function wrappedListener(
  tracer: Tracer,
  instrumentationConfig: PulsarInstrumentationConfig,
  moduleVersion: string | undefined,
  config: ConsumerConfig,
  listener: ConsumerListener
): ConsumerListener {
  return async (message: Pulsar.Message, consumer: Pulsar.Consumer) => {
    const span = extractSpanFromMessage(tracer, instrumentationConfig, moduleVersion, config, message);
    try {
      await callback(listener, message, consumer);
    } catch (error) {
      span.recordException(error);
      span.setStatus({code: SpanStatusCode.ERROR});
      throw error;
    } finally {
      span.end();
      if (instrumentationConfig.trackBeforeAndAfterConsume) {
        trackBeforeAndAfterConsume(tracer, spanNames.afterConsume, getAttributesFromMessage(message));
      }
    }
  };
}

async function callback(
  original: ConsumerListener,
  message: Pulsar.Message,
  consumer: Pulsar.Consumer
) {
  // Deal with both sync and asynchronous functions
  const rv = original(message, consumer);
  if (rv?.then != undefined) {
    await rv;
  }
}
