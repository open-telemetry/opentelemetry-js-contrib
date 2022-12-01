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
import * as api from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { Instrumentation } from '../instrumentation';

export class ProducerProxy implements Pulsar.Producer {
  private _producer: Pulsar.Producer;
  private _tracer: api.Tracer;
  private readonly _moduleVersion: undefined | string;
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
    return this._producer.flush();
  }

  close(): Promise<null> {
    return this._producer.close();
  }

  getProducerName(): string {
    return this._producer.getProducerName();
  }

  getTopic(): string {
    return this._producer.getTopic();
  }

  isConnected(): boolean {
    return this._producer.isConnected();
  }

  async send(message: Pulsar.ProducerMessage): Promise<Pulsar.MessageId> {
    const parentContext = api.context.active();

    const span = this._tracer.startSpan(
      'send',
      {
        kind: api.SpanKind.PRODUCER,
        attributes: {
          'pulsar.version': this._moduleVersion,
          [SemanticAttributes.MESSAGING_DESTINATION]: this._config.topic,
          ...Instrumentation.COMMON_ATTRIBUTES,
        },
      },
      parentContext
    );

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
