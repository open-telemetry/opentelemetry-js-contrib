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

import * as api from '@opentelemetry/api';
import { Span, Tracer } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import type * as Pulsar from 'pulsar-client';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { InstrumentationConfig } from './types';
import { VERSION } from './version';

type PulsarConstructor = new (config: Pulsar.ClientConfig) => Pulsar.Client;

export class Instrumentation extends InstrumentationBase<typeof Pulsar.Client> {
  static readonly COMPONENT = 'pulsar';
  static readonly COMMON_ATTRIBUTES = {
    [SemanticAttributes.MESSAGING_SYSTEM]: 'pulsar',
  };
  static readonly DEFAULT_CONFIG: InstrumentationConfig = {
    enhancedDatabaseReporting: false,
  };

  constructor(config: InstrumentationConfig = {}) {
    super(
      '@opentelemetry/instrumentation-pulsar-client',
      VERSION,
      Object.assign({}, Instrumentation.DEFAULT_CONFIG, config)
    );
  }

  override setConfig(config: InstrumentationConfig = {}) {
    this._config = Object.assign({}, Instrumentation.DEFAULT_CONFIG, config);
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition<typeof Pulsar>(
        'pulsar-client',
        ['>=1.0'],
        (moduleExports, moduleVersion) => {
          this._diag.debug(
            `Patching ${Instrumentation.COMPONENT}@${moduleVersion}`
          );
          this.ensureWrapped(
            moduleVersion,
            moduleExports,
            'Client',
            this.wrapClient.bind(this, moduleVersion)
          );
          return moduleExports;
        },
        (moduleExports, moduleVersion) => {
          this._diag.debug(
            `Unpatching ${Instrumentation.COMPONENT}@${moduleVersion}`
          );
          if (moduleExports === undefined) return;

          this._unwrap(moduleExports, 'Client');
        }
      ),
    ];
  }

  wrapClient(moduleVersion: undefined | string, original: PulsarConstructor) {
    const tracer = this.tracer;
    return function (config: Pulsar.ClientConfig) {
      return new ClientProxy(tracer, moduleVersion, new original(config));
    };
  }

  private ensureWrapped(
    moduleVersion: string | undefined,
    obj: Pulsar.Client,
    methodName: string,
    wrapper: PulsarConstructor
  ) {
    this._diag.debug(
      `Applying ${methodName} patch for ${Instrumentation.COMPONENT}@${moduleVersion}`
    );
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(obj, methodName, wrapper);
  }
}

class ClientProxy implements Pulsar.Client {
  private _client: Pulsar.Client;
  private _tracer: api.Tracer;
  private _moduleVersion: undefined | string;

  constructor(
    tracer: api.Tracer,
    moduleVersion: undefined | string,
    client: Pulsar.Client
  ) {
    this._tracer = tracer;
    this._moduleVersion = moduleVersion;
    this._client = client;
  }

  createReader(config: Pulsar.ReaderConfig): Promise<Pulsar.Reader> {
    throw new Error('Method not implemented.');
  }

  async createProducer(
    config: Pulsar.ProducerConfig
  ): Promise<Pulsar.Producer> {
    const producer = await this._client.createProducer(config);
    return new ProducerProxy(
      this._tracer,
      this._moduleVersion,
      config,
      producer
    );
  }
  async subscribe(config: Pulsar.ConsumerConfig): Promise<Pulsar.Consumer> {
    const consumer = await this._client.subscribe(config);
    return new ConsumerProxy(
      this._tracer,
      this._moduleVersion,
      config,
      consumer
    );
  }
  // createReader(config: Pulsar.ReaderConfig): Promise<Pulsar.Reader>;
  close(): Promise<null> {
    return this._client.close();
  }
}

class ProducerProxy implements Pulsar.Producer {
  private _producer: Pulsar.Producer;
  private _tracer: api.Tracer;
  private _moduleVersion: undefined | string;
  private _config: Pulsar.ProducerConfig;

  constructor(
    tracer: api.Tracer,
    moduleVersion: undefined | string,
    config: Pulsar.ProducerConfig,
    producer: Pulsar.Producer
  ) {
    this._tracer = tracer;
    this._moduleVersion = moduleVersion;
    this._config = config;
    this._producer = producer;
  }

  flush(): Promise<null> {
    throw new Error('Method not implemented.');
  }
  close(): Promise<null> {
    throw new Error('Method not implemented.');
  }
  getProducerName(): string {
    throw new Error('Method not implemented.');
  }
  getTopic(): string {
    throw new Error('Method not implemented.');
  }
  isConnected(): boolean {
    throw new Error('Method not implemented.');
  }

  async send(message: Pulsar.ProducerMessage): Promise<Pulsar.MessageId> {
    const parentContext = api.context.active();

    const span = this._tracer.startSpan('send', {
      kind: api.SpanKind.PRODUCER,
      attributes: {
        'pulsar.version': this._moduleVersion,
        [SemanticAttributes.MESSAGING_DESTINATION]: this._config.topic,
        ...Instrumentation.COMMON_ATTRIBUTES,
      },
    });
    message.properties ||= {};
    const context = api.trace.setSpan(parentContext, span);
    api.propagation.inject(context, message.properties);

    try {
      return await this._producer.send(message);
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: api.SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  }
}

class ConsumerProxy implements Pulsar.Consumer {
  private _tracer: Tracer;
  private _moduleVersion: string | undefined;
  private config: Pulsar.ConsumerConfig;
  private consumer: Pulsar.Consumer;

  private _lastSpan: Span | undefined;

  constructor(
    _tracer: Tracer,
    _moduleVersion: string | undefined,
    config: Pulsar.ConsumerConfig,
    consumer: Pulsar.Consumer
  ) {
    this._tracer = _tracer;
    this._moduleVersion = _moduleVersion;
    this.config = config;
    this.consumer = consumer;
  }

  async receive(timeout?: number): Promise<Pulsar.Message> {
    this.closePreviousSpan();
    const message = await this.consumer.receive(timeout);

    const remoteContext = api.propagation.extract(
      api.context.active(),
      message.getProperties()
    );
    const span = this._tracer.startSpan(
      'receive',
      {
        kind: api.SpanKind.CONSUMER,
        attributes: {
          'pulsar.version': this._moduleVersion,
          topic: this.config.topic,
          ...Instrumentation.COMMON_ATTRIBUTES,
        },
      },
      remoteContext
    );

    api.trace.setSpan(remoteContext, span);

    // Postpone the span ending for the next time the user calls receive
    this._lastSpan = span;
    return message;
  }

  private closePreviousSpan() {
    // User is done with the last message and called receive again.
    if (this._lastSpan) {
      this._lastSpan.end();
    }
  }

  acknowledge(message: Pulsar.Message): Promise<null> {
    this.closePreviousSpan();
    throw new Error('Method not implemented.');
  }
  acknowledgeId(messageId: Pulsar.MessageId): Promise<null> {
    this.closePreviousSpan();
    throw new Error('Method not implemented.');
  }
  negativeAcknowledge(message: Pulsar.Message): void {
    this.closePreviousSpan();
    throw new Error('Method not implemented.');
  }
  negativeAcknowledgeId(messageId: Pulsar.MessageId): void {
    this.closePreviousSpan();
    throw new Error('Method not implemented.');
  }
  acknowledgeCumulative(message: Pulsar.Message): Promise<null> {
    this.closePreviousSpan();
    throw new Error('Method not implemented.');
  }
  acknowledgeCumulativeId(messageId: Pulsar.MessageId): Promise<null> {
    this.closePreviousSpan();
    throw new Error('Method not implemented.');
  }
  isConnected(): boolean {
    throw new Error('Method not implemented.');
  }
  close(): Promise<null> {
    this.closePreviousSpan();
    return this.consumer.close();
  }
  unsubscribe(): Promise<null> {
    this.closePreviousSpan();
    throw new Error('Method not implemented.');
  }
}
