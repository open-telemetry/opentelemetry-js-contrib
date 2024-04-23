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
  SpanKind,
  Span,
  SpanStatusCode,
  Context,
  propagation,
  Link,
  trace,
  context,
  ROOT_CONTEXT,
} from '@opentelemetry/api';
import {
  MESSAGINGDESTINATIONKINDVALUES_TOPIC,
  MESSAGINGOPERATIONVALUES_PROCESS,
  MESSAGINGOPERATIONVALUES_RECEIVE,
  SEMATTRS_MESSAGING_SYSTEM,
  SEMATTRS_MESSAGING_DESTINATION_KIND,
  SEMATTRS_MESSAGING_DESTINATION,
  SEMATTRS_MESSAGING_OPERATION,
} from '@opentelemetry/semantic-conventions';
import type * as kafkaJs from 'kafkajs';
import type {
  EachBatchHandler,
  EachMessageHandler,
  Producer,
  RecordMetadata,
  Message,
  ConsumerRunConfig,
  KafkaMessage,
  Consumer,
} from 'kafkajs';
import { KafkaJsInstrumentationConfig } from './types';
import { VERSION } from './version';
import { bufferTextMapGetter } from './propagator';
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
  isWrapped,
} from '@opentelemetry/instrumentation';

export class KafkaJsInstrumentation extends InstrumentationBase<
  typeof kafkaJs
> {
  protected override _config!: KafkaJsInstrumentationConfig;

  constructor(config: KafkaJsInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-kafkajs', VERSION, config);
  }

  protected init(): InstrumentationModuleDefinition<typeof kafkaJs> {
    const unpatch: InstrumentationModuleDefinition<
      typeof kafkaJs
    >['unpatch'] = moduleExports => {
      this._diag.debug('Removing patch for kafkajs');
      if (isWrapped(moduleExports?.Kafka?.prototype.producer)) {
        this._unwrap(moduleExports.Kafka.prototype, 'producer');
      }
      if (isWrapped(moduleExports?.Kafka?.prototype.consumer)) {
        this._unwrap(moduleExports.Kafka.prototype, 'consumer');
      }
    };
    const module: InstrumentationModuleDefinition<typeof kafkaJs> =
      new InstrumentationNodeModuleDefinition<typeof kafkaJs>(
        'kafkajs',
        ['*'],
        moduleExports => {
          this._diag.debug('Applying patch for kafkajs');

          unpatch(moduleExports);
          this._wrap(
            moduleExports?.Kafka?.prototype,
            'producer',
            this._getProducerPatch()
          );
          this._wrap(
            moduleExports?.Kafka?.prototype,
            'consumer',
            this._getConsumerPatch()
          );

          return moduleExports;
        },
        unpatch
      );
    module.includePrerelease = true;
    return module;
  }

  private _getConsumerPatch() {
    const instrumentation = this;
    return (original: kafkaJs.Kafka['consumer']) => {
      return function consumer(
        this: kafkaJs.Kafka,
        ...args: Parameters<kafkaJs.Kafka['consumer']>
      ) {
        const newConsumer: Consumer = original.apply(this, args);

        if (isWrapped(newConsumer.run)) {
          instrumentation._unwrap(newConsumer, 'run');
        }

        instrumentation._wrap(
          newConsumer,
          'run',
          instrumentation._getConsumerRunPatch()
        );

        return newConsumer;
      };
    };
  }

  private _getProducerPatch() {
    const instrumentation = this;
    return (original: kafkaJs.Kafka['producer']) => {
      return function consumer(
        this: kafkaJs.Kafka,
        ...args: Parameters<kafkaJs.Kafka['producer']>
      ) {
        const newProducer: Producer = original.apply(this, args);

        if (isWrapped(newProducer.sendBatch)) {
          instrumentation._unwrap(newProducer, 'sendBatch');
        }
        instrumentation._wrap(
          newProducer,
          'sendBatch',
          instrumentation._getProducerSendBatchPatch()
        );

        if (isWrapped(newProducer.send)) {
          instrumentation._unwrap(newProducer, 'send');
        }
        instrumentation._wrap(
          newProducer,
          'send',
          instrumentation._getProducerSendPatch()
        );

        return newProducer;
      };
    };
  }

  private _getConsumerRunPatch() {
    const instrumentation = this;
    return (original: Consumer['run']) => {
      return function run(
        this: Consumer,
        ...args: Parameters<Consumer['run']>
      ): ReturnType<Consumer['run']> {
        const config = args[0];
        if (config?.eachMessage) {
          if (isWrapped(config.eachMessage)) {
            instrumentation._unwrap(config, 'eachMessage');
          }
          instrumentation._wrap(
            config,
            'eachMessage',
            instrumentation._getConsumerEachMessagePatch()
          );
        }
        if (config?.eachBatch) {
          if (isWrapped(config.eachBatch)) {
            instrumentation._unwrap(config, 'eachBatch');
          }
          instrumentation._wrap(
            config,
            'eachBatch',
            instrumentation._getConsumerEachBatchPatch()
          );
        }
        return original.call(this, config);
      };
    };
  }

  private _getConsumerEachMessagePatch() {
    const instrumentation = this;
    return (original: ConsumerRunConfig['eachMessage']) => {
      return function eachMessage(
        this: unknown,
        ...args: Parameters<EachMessageHandler>
      ): Promise<void> {
        const payload = args[0];
        const propagatedContext: Context = propagation.extract(
          ROOT_CONTEXT,
          payload.message.headers,
          bufferTextMapGetter
        );
        const span = instrumentation._startConsumerSpan(
          payload.topic,
          payload.message,
          MESSAGINGOPERATIONVALUES_PROCESS,
          propagatedContext
        );

        const eachMessagePromise = context.with(
          trace.setSpan(propagatedContext, span),
          () => {
            return original!.apply(this, args);
          }
        );
        return instrumentation._endSpansOnPromise([span], eachMessagePromise);
      };
    };
  }

  private _getConsumerEachBatchPatch() {
    return (original: ConsumerRunConfig['eachBatch']) => {
      const instrumentation = this;
      return function eachBatch(
        this: unknown,
        ...args: Parameters<EachBatchHandler>
      ): Promise<void> {
        const payload = args[0];
        // https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/trace/semantic_conventions/messaging.md#topic-with-multiple-consumers
        const receivingSpan = instrumentation._startConsumerSpan(
          payload.batch.topic,
          undefined,
          MESSAGINGOPERATIONVALUES_RECEIVE,
          ROOT_CONTEXT
        );
        return context.with(
          trace.setSpan(context.active(), receivingSpan),
          () => {
            const spans = payload.batch.messages.map(
              (message: KafkaMessage) => {
                const propagatedContext: Context = propagation.extract(
                  ROOT_CONTEXT,
                  message.headers,
                  bufferTextMapGetter
                );
                const spanContext = trace
                  .getSpan(propagatedContext)
                  ?.spanContext();
                let origSpanLink: Link | undefined;
                if (spanContext) {
                  origSpanLink = {
                    context: spanContext,
                  };
                }
                return instrumentation._startConsumerSpan(
                  payload.batch.topic,
                  message,
                  MESSAGINGOPERATIONVALUES_PROCESS,
                  undefined,
                  origSpanLink
                );
              }
            );
            const batchMessagePromise: Promise<void> = original!.apply(
              this,
              args
            );
            spans.unshift(receivingSpan);
            return instrumentation._endSpansOnPromise(
              spans,
              batchMessagePromise
            );
          }
        );
      };
    };
  }

  private _getProducerSendBatchPatch() {
    const instrumentation = this;
    return (original: Producer['sendBatch']) => {
      return function sendBatch(
        this: Producer,
        ...args: Parameters<Producer['sendBatch']>
      ): ReturnType<Producer['sendBatch']> {
        const batch = args[0];
        const messages = batch.topicMessages || [];
        const spans: Span[] = messages
          .map(topicMessage =>
            topicMessage.messages.map(message =>
              instrumentation._startProducerSpan(topicMessage.topic, message)
            )
          )
          .reduce((acc, val) => acc.concat(val), []);

        const origSendResult: Promise<RecordMetadata[]> = original.apply(
          this,
          args
        );
        return instrumentation._endSpansOnPromise(spans, origSendResult);
      };
    };
  }

  private _getProducerSendPatch() {
    const instrumentation = this;
    return (original: Producer['send']) => {
      return function send(
        this: Producer,
        ...args: Parameters<Producer['send']>
      ): ReturnType<Producer['send']> {
        const record = args[0];
        const spans: Span[] = record.messages.map(message => {
          return instrumentation._startProducerSpan(record.topic, message);
        });

        const origSendResult: Promise<RecordMetadata[]> = original.apply(
          this,
          args
        );
        return instrumentation._endSpansOnPromise(spans, origSendResult);
      };
    };
  }

  private _endSpansOnPromise<T>(
    spans: Span[],
    sendPromise: Promise<T>
  ): Promise<T> {
    return Promise.resolve(sendPromise)
      .catch(reason => {
        let errorMessage: string;
        if (typeof reason === 'string') errorMessage = reason;
        else if (
          typeof reason === 'object' &&
          Object.prototype.hasOwnProperty.call(reason, 'message')
        )
          errorMessage = reason.message;

        spans.forEach(span =>
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: errorMessage,
          })
        );

        throw reason;
      })
      .finally(() => {
        spans.forEach(span => span.end());
      });
  }

  private _startConsumerSpan(
    topic: string,
    message: KafkaMessage | undefined,
    operation: string,
    context: Context | undefined,
    link?: Link
  ) {
    const span = this.tracer.startSpan(
      topic,
      {
        kind: SpanKind.CONSUMER,
        attributes: {
          [SEMATTRS_MESSAGING_SYSTEM]: 'kafka',
          [SEMATTRS_MESSAGING_DESTINATION]: topic,
          [SEMATTRS_MESSAGING_DESTINATION_KIND]:
            MESSAGINGDESTINATIONKINDVALUES_TOPIC,
          [SEMATTRS_MESSAGING_OPERATION]: operation,
        },
        links: link ? [link] : [],
      },
      context
    );

    if (this._config?.consumerHook && message) {
      safeExecuteInTheMiddle(
        () => this._config.consumerHook!(span, { topic, message }),
        e => {
          if (e) this._diag.error('consumerHook error', e);
        },
        true
      );
    }

    return span;
  }

  private _startProducerSpan(topic: string, message: Message) {
    const span = this.tracer.startSpan(topic, {
      kind: SpanKind.PRODUCER,
      attributes: {
        [SEMATTRS_MESSAGING_SYSTEM]: 'kafka',
        [SEMATTRS_MESSAGING_DESTINATION]: topic,
        [SEMATTRS_MESSAGING_DESTINATION_KIND]:
          MESSAGINGDESTINATIONKINDVALUES_TOPIC,
      },
    });

    message.headers = message.headers ?? {};
    propagation.inject(trace.setSpan(context.active(), span), message.headers);

    if (this._config?.producerHook) {
      safeExecuteInTheMiddle(
        () => this._config.producerHook!(span, { topic, message }),
        e => {
          if (e) this._diag.error('producerHook error', e);
        },
        true
      );
    }

    return span;
  }
}
