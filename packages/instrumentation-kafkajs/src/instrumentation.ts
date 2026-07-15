/*
 * Copyright The OpenTelemetry Authors, Aspecto
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Attributes,
  Context,
  context,
  Counter,
  diag,
  Histogram,
  Link,
  propagation,
  ROOT_CONTEXT,
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import {
  ATTR_ERROR_TYPE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  ERROR_TYPE_VALUE_OTHER,
} from '@opentelemetry/semantic-conventions';
import type * as kafkaJs from 'kafkajs';
import type {
  Consumer,
  ConsumerRunConfig,
  EachBatchHandler,
  EachMessageHandler,
  KafkaMessage,
  Message,
  Producer,
  RecordMetadata,
} from 'kafkajs';
import { EVENT_LISTENERS_SET } from './internal-types';
import { bufferTextMapGetter } from './propagator';
import {
  ATTR_MESSAGING_BATCH_MESSAGE_COUNT,
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_DESTINATION_PARTITION_ID,
  ATTR_MESSAGING_KAFKA_CLUSTER_ID,
  ATTR_MESSAGING_KAFKA_MESSAGE_KEY,
  ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE,
  ATTR_MESSAGING_KAFKA_OFFSET,
  ATTR_MESSAGING_OPERATION_NAME,
  ATTR_MESSAGING_OPERATION_TYPE,
  ATTR_MESSAGING_SYSTEM,
  MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
  MESSAGING_OPERATION_TYPE_VALUE_RECEIVE,
  MESSAGING_OPERATION_TYPE_VALUE_SEND,
  MESSAGING_SYSTEM_VALUE_KAFKA,
  METRIC_MESSAGING_CLIENT_CONSUMED_MESSAGES,
  METRIC_MESSAGING_CLIENT_OPERATION_DURATION,
  METRIC_MESSAGING_CLIENT_SENT_MESSAGES,
  METRIC_MESSAGING_PROCESS_DURATION,
} from './semconv';
import { KafkaJsInstrumentationConfig } from './types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

interface ConsumerSpanOptions {
  topic: string;
  message: KafkaMessage | undefined;
  operationType: string;
  attributes: Attributes;
  ctx?: Context | undefined;
  link?: Link;
  kafkaInstance?: kafkaJs.Kafka;
}
// This interface acts as a strict subset of the KafkaJS Consumer and
// Producer interfaces (just for the event we're needing)
interface KafkaEventEmitter {
  on(
    eventName:
      | kafkaJs.ConsumerEvents['REQUEST']
      | kafkaJs.ProducerEvents['REQUEST'],
    listener: (event: kafkaJs.RequestEvent) => void
  ): void;
  events: {
    REQUEST:
      | kafkaJs.ConsumerEvents['REQUEST']
      | kafkaJs.ProducerEvents['REQUEST'];
  };
  [EVENT_LISTENERS_SET]?: boolean;
}

interface StandardAttributes<OP extends string = string> extends Attributes {
  [ATTR_MESSAGING_SYSTEM]: string;
  [ATTR_MESSAGING_OPERATION_NAME]: OP;
  [ATTR_ERROR_TYPE]?: string;
}
interface TopicAttributes {
  [ATTR_MESSAGING_DESTINATION_NAME]: string;
  [ATTR_MESSAGING_DESTINATION_PARTITION_ID]?: string;
}

interface ClientDurationAttributes
  extends StandardAttributes,
    Partial<TopicAttributes> {
  [ATTR_SERVER_ADDRESS]: string;
  [ATTR_SERVER_PORT]: number;
  [ATTR_MESSAGING_OPERATION_TYPE]?: string;
}
interface SentMessagesAttributes
  extends StandardAttributes<'send'>,
    TopicAttributes {
  [ATTR_ERROR_TYPE]?: string;
}
type ConsumedMessagesAttributes = StandardAttributes<'receive' | 'process'>;
interface MessageProcessDurationAttributes
  extends StandardAttributes<'process'>,
    TopicAttributes {
  [ATTR_MESSAGING_SYSTEM]: string;
  [ATTR_MESSAGING_OPERATION_NAME]: 'process';
  [ATTR_ERROR_TYPE]?: string;
}
type RecordPendingMetric = (errorType?: string | undefined) => void;

function prepareCounter<T extends Attributes>(
  meter: Counter<T>,
  value: number,
  attributes: T
): RecordPendingMetric {
  return (errorType?: string | undefined) => {
    meter.add(value, {
      ...attributes,
      ...(errorType ? { [ATTR_ERROR_TYPE]: errorType } : {}),
    });
  };
}

function prepareDurationHistogram<T extends Attributes>(
  meter: Histogram<T>,
  value: number,
  attributes: T
): RecordPendingMetric {
  return (errorType?: string | undefined) => {
    meter.record((Date.now() - value) / 1000, {
      ...attributes,
      ...(errorType ? { [ATTR_ERROR_TYPE]: errorType } : {}),
    });
  };
}

const HISTOGRAM_BUCKET_BOUNDARIES = [
  0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10,
];

const _CLUSTER_ID_TTL_MS = 60 * 60 * 1000;

// WeakMap ensures no retention after GC.
const _clusterIdByKafka = new WeakMap<kafkaJs.Kafka, string>();
const _clusterIdFetchedAt = new WeakMap<kafkaJs.Kafka, number>();
const _clusterIdFetching = new WeakSet<kafkaJs.Kafka>();
// Marks instances whose broker returned a null/empty cluster ID (pre-KIP-78 brokers).
// Prevents an unbounded retry storm against brokers that will never return a cluster ID.
// Note: connection errors do NOT set this — they allow retry on the next client creation.
const _clusterIdUnavailable = new WeakSet<kafkaJs.Kafka>();

function _triggerClusterIdFetch(kafkaInstance: kafkaJs.Kafka): void {
  if (_clusterIdUnavailable.has(kafkaInstance)) return;
  if (_clusterIdFetching.has(kafkaInstance)) return;
  if (_clusterIdByKafka.has(kafkaInstance)) {
    const fetchedAt = _clusterIdFetchedAt.get(kafkaInstance);
    if (
      fetchedAt !== undefined &&
      Date.now() - fetchedAt <= _CLUSTER_ID_TTL_MS
    ) {
      return;
    }
    // Stale value stays in map until re-fetch succeeds.
  }
  _clusterIdFetching.add(kafkaInstance);
  // kafkajs <1.0 has no admin() — would throw synchronously before the .catch() handler.
  if (
    typeof (kafkaInstance as unknown as Record<string, unknown>)['admin'] !==
    'function'
  ) {
    _clusterIdUnavailable.add(kafkaInstance);
    _clusterIdFetching.delete(kafkaInstance);
    return;
  }
  // admin() / connect() can throw synchronously (e.g. a misconfigured or
  // non-standard client). This runs from the patched producer()/consumer() and,
  // via the TTL-refresh path, from span creation — so a throw here must never
  // escape into the user's call. Keep the whole setup inside try/catch.
  let admin: kafkaJs.Admin | undefined;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    const adminClient = (admin = kafkaInstance.admin());
    const connectPromise = adminClient.connect();
    let connected = false;
    // Single deadline covering BOTH connect() and describeCluster(). A hang in either
    // stage would otherwise keep the admin client (and its socket) alive indefinitely.
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error('KafkaJS cluster-id lookup timed out after 10s')),
        10_000
      );
      if (
        timeoutHandle &&
        typeof timeoutHandle === 'object' &&
        'unref' in timeoutHandle
      )
        (timeoutHandle as NodeJS.Timeout).unref();
    });
    const lookup = connectPromise.then(() => {
      connected = true;
      return adminClient.describeCluster();
    });
    Promise.race([lookup, timeout])
      .then(({ clusterId }) => {
        if (clusterId != null && clusterId !== '') {
          _clusterIdByKafka.set(kafkaInstance, clusterId);
          _clusterIdFetchedAt.set(kafkaInstance, Date.now());
        } else {
          // No cluster id (pre-KIP-78 broker). A good id cached from an earlier
          // fetch is deliberately left in place — cluster ids are stable — but the
          // instance is now marked unavailable, which also stops future refreshes.
          // Acceptable: a value that never changes does not need refreshing.
          _clusterIdUnavailable.add(kafkaInstance);
        }
      })
      .catch((err: unknown) => {
        // Transient failure or timeout. Do NOT mark unavailable — the next client creation
        // will retry. If connect() is still in-flight (timeout case), schedule disconnect
        // for when it resolves to release the socket.
        if (!connected) {
          connectPromise
            .then(() => adminClient.disconnect().catch(() => {}))
            .catch(() => {});
        }
        diag.warn(
          'opentelemetry-instrumentation-kafkajs: failed to fetch cluster ID',
          err
        );
      })
      .finally(() => {
        clearTimeout(timeoutHandle);
        _clusterIdFetching.delete(kafkaInstance);
        // connect() had resolved (describeCluster resolved, rejected, or timed out
        // mid-flight), so the socket is open — close it.
        if (connected) {
          adminClient.disconnect().catch(() => {});
        }
      });
  } catch (err: unknown) {
    // admin() or connect() threw synchronously. Clear the in-flight marker so a
    // later client creation can retry, and best-effort close any admin we created.
    clearTimeout(timeoutHandle);
    _clusterIdFetching.delete(kafkaInstance);
    try {
      admin?.disconnect().catch(() => {});
    } catch {
      // ignore — disconnect() on a client that never connected may itself throw
    }
    diag.warn(
      'opentelemetry-instrumentation-kafkajs: failed to fetch cluster ID',
      err
    );
  }
}

// _triggerClusterIdFetch already handles freshness checks, so calling it unconditionally
// when a value is present is safe — it no-ops if the TTL has not yet expired.
function _clusterIdForSpan(
  kafkaInstance: kafkaJs.Kafka | undefined
): string | undefined {
  if (kafkaInstance === undefined) return undefined;
  const id = _clusterIdByKafka.get(kafkaInstance);
  if (id !== undefined) _triggerClusterIdFetch(kafkaInstance);
  return id;
}

export class KafkaJsInstrumentation extends InstrumentationBase<KafkaJsInstrumentationConfig> {
  declare private _clientDuration: Histogram<ClientDurationAttributes>;
  declare private _sentMessages: Counter<SentMessagesAttributes>;
  declare private _consumedMessages: Counter<ConsumedMessagesAttributes>;
  declare private _processDuration: Histogram<MessageProcessDurationAttributes>;

  constructor(config: KafkaJsInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  override _updateMetricInstruments() {
    this._clientDuration = this.meter.createHistogram(
      METRIC_MESSAGING_CLIENT_OPERATION_DURATION,
      { advice: { explicitBucketBoundaries: HISTOGRAM_BUCKET_BOUNDARIES } }
    );
    this._sentMessages = this.meter.createCounter(
      METRIC_MESSAGING_CLIENT_SENT_MESSAGES
    );
    this._consumedMessages = this.meter.createCounter(
      METRIC_MESSAGING_CLIENT_CONSUMED_MESSAGES
    );
    this._processDuration = this.meter.createHistogram(
      METRIC_MESSAGING_PROCESS_DURATION,
      { advice: { explicitBucketBoundaries: HISTOGRAM_BUCKET_BOUNDARIES } }
    );
  }

  protected init() {
    const unpatch = (moduleExports: typeof kafkaJs) => {
      if (isWrapped(moduleExports?.Kafka?.prototype.producer)) {
        this._unwrap(moduleExports.Kafka.prototype, 'producer');
      }
      if (isWrapped(moduleExports?.Kafka?.prototype.consumer)) {
        this._unwrap(moduleExports.Kafka.prototype, 'consumer');
      }
    };

    const module = new InstrumentationNodeModuleDefinition(
      'kafkajs',
      ['>=0.3.0 <3'],
      (moduleExports: typeof kafkaJs) => {
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
    return module;
  }

  private _getConsumerPatch() {
    const instrumentation = this;
    return (original: kafkaJs.Kafka['consumer']) => {
      return function consumer(
        this: kafkaJs.Kafka,
        ...args: Parameters<kafkaJs.Kafka['consumer']>
      ) {
        _triggerClusterIdFetch(this);
        const newConsumer: Consumer = original.apply(this, args);

        if (isWrapped(newConsumer.run)) {
          instrumentation._unwrap(newConsumer, 'run');
        }

        instrumentation._wrap(
          newConsumer,
          'run',
          instrumentation._getConsumerRunPatch(this)
        );

        instrumentation._setKafkaEventListeners(newConsumer);

        return newConsumer;
      };
    };
  }

  private _setKafkaEventListeners(kafkaObj: KafkaEventEmitter) {
    if (kafkaObj[EVENT_LISTENERS_SET]) return;

    // The REQUEST Consumer event was added in kafkajs@1.5.0.
    if (kafkaObj.events?.REQUEST) {
      kafkaObj.on(
        kafkaObj.events.REQUEST,
        this._recordClientDurationMetric.bind(this)
      );
    }

    kafkaObj[EVENT_LISTENERS_SET] = true;
  }

  private _recordClientDurationMetric(
    event: Pick<kafkaJs.RequestEvent, 'payload'>
  ) {
    const [address, port] = event.payload.broker.split(':');
    this._clientDuration.record(event.payload.duration / 1000, {
      [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
      [ATTR_MESSAGING_OPERATION_NAME]: `${event.payload.apiName}`, // potentially suffix with @v${event.payload.apiVersion}?
      [ATTR_SERVER_ADDRESS]: address,
      [ATTR_SERVER_PORT]: Number.parseInt(port, 10),
    });
  }

  private _getProducerPatch() {
    const instrumentation = this;
    return (original: kafkaJs.Kafka['producer']) => {
      return function consumer(
        this: kafkaJs.Kafka,
        ...args: Parameters<kafkaJs.Kafka['producer']>
      ) {
        _triggerClusterIdFetch(this);
        const newProducer: Producer = original.apply(this, args);

        if (isWrapped(newProducer.sendBatch)) {
          instrumentation._unwrap(newProducer, 'sendBatch');
        }
        instrumentation._wrap(
          newProducer,
          'sendBatch',
          instrumentation._getSendBatchPatch(this)
        );

        if (isWrapped(newProducer.send)) {
          instrumentation._unwrap(newProducer, 'send');
        }
        instrumentation._wrap(
          newProducer,
          'send',
          instrumentation._getSendPatch(this)
        );

        if (isWrapped(newProducer.transaction)) {
          instrumentation._unwrap(newProducer, 'transaction');
        }
        instrumentation._wrap(
          newProducer,
          'transaction',
          instrumentation._getProducerTransactionPatch(this)
        );

        instrumentation._setKafkaEventListeners(newProducer);

        return newProducer;
      };
    };
  }

  private _getConsumerRunPatch(kafkaInstance?: kafkaJs.Kafka) {
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
            instrumentation._getConsumerEachMessagePatch(kafkaInstance)
          );
        }
        if (config?.eachBatch) {
          if (isWrapped(config.eachBatch)) {
            instrumentation._unwrap(config, 'eachBatch');
          }
          instrumentation._wrap(
            config,
            'eachBatch',
            instrumentation._getConsumerEachBatchPatch(kafkaInstance)
          );
        }
        return original.call(this, config);
      };
    };
  }

  private _getConsumerEachMessagePatch(kafkaInstance?: kafkaJs.Kafka) {
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
        const span = instrumentation._startConsumerSpan({
          topic: payload.topic,
          message: payload.message,
          operationType: MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
          ctx: propagatedContext,
          kafkaInstance,
          attributes: {
            [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(
              payload.partition
            ),
          },
        });

        const pendingMetrics: RecordPendingMetric[] = [
          prepareDurationHistogram(
            instrumentation._processDuration,
            Date.now(),
            {
              [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
              [ATTR_MESSAGING_OPERATION_NAME]: 'process',
              [ATTR_MESSAGING_DESTINATION_NAME]: payload.topic,
              [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(
                payload.partition
              ),
            }
          ),
          prepareCounter(instrumentation._consumedMessages, 1, {
            [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
            [ATTR_MESSAGING_OPERATION_NAME]: 'process',
            [ATTR_MESSAGING_DESTINATION_NAME]: payload.topic,
            [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(
              payload.partition
            ),
          }),
        ];

        const eachMessagePromise = context.with(
          trace.setSpan(propagatedContext, span),
          () => {
            return original!.apply(this, args);
          }
        );
        return instrumentation._endSpansOnPromise(
          [span],
          pendingMetrics,
          eachMessagePromise
        );
      };
    };
  }

  private _getConsumerEachBatchPatch(kafkaInstance?: kafkaJs.Kafka) {
    return (original: ConsumerRunConfig['eachBatch']) => {
      const instrumentation = this;
      return function eachBatch(
        this: unknown,
        ...args: Parameters<EachBatchHandler>
      ): Promise<void> {
        const payload = args[0];
        // https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/trace/semantic_conventions/messaging.md#topic-with-multiple-consumers
        const receivingSpan = instrumentation._startConsumerSpan({
          topic: payload.batch.topic,
          message: undefined,
          operationType: MESSAGING_OPERATION_TYPE_VALUE_RECEIVE,
          ctx: ROOT_CONTEXT,
          kafkaInstance,
          attributes: {
            [ATTR_MESSAGING_BATCH_MESSAGE_COUNT]: payload.batch.messages.length,
            [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(
              payload.batch.partition
            ),
          },
        });
        return context.with(
          trace.setSpan(context.active(), receivingSpan),
          () => {
            const startTime = Date.now();
            const spans: Span[] = [];
            const pendingMetrics: RecordPendingMetric[] = [
              prepareCounter(
                instrumentation._consumedMessages,
                payload.batch.messages.length,
                {
                  [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
                  [ATTR_MESSAGING_OPERATION_NAME]: 'process',
                  [ATTR_MESSAGING_DESTINATION_NAME]: payload.batch.topic,
                  [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(
                    payload.batch.partition
                  ),
                }
              ),
            ];
            payload.batch.messages.forEach(message => {
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
              spans.push(
                instrumentation._startConsumerSpan({
                  topic: payload.batch.topic,
                  message,
                  operationType: MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
                  link: origSpanLink,
                  kafkaInstance,
                  attributes: {
                    [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(
                      payload.batch.partition
                    ),
                  },
                })
              );
              pendingMetrics.push(
                prepareDurationHistogram(
                  instrumentation._processDuration,
                  startTime,
                  {
                    [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
                    [ATTR_MESSAGING_OPERATION_NAME]: 'process',
                    [ATTR_MESSAGING_DESTINATION_NAME]: payload.batch.topic,
                    [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(
                      payload.batch.partition
                    ),
                  }
                )
              );
            });
            const batchMessagePromise: Promise<void> = original!.apply(
              this,
              args
            );
            spans.unshift(receivingSpan);
            return instrumentation._endSpansOnPromise(
              spans,
              pendingMetrics,
              batchMessagePromise
            );
          }
        );
      };
    };
  }

  private _getProducerTransactionPatch(kafkaInstance?: kafkaJs.Kafka) {
    const instrumentation = this;
    return (original: Producer['transaction']) => {
      return function transaction(
        this: Producer,
        ...args: Parameters<Producer['transaction']>
      ): ReturnType<Producer['transaction']> {
        const transactionSpan = instrumentation.tracer.startSpan('transaction');

        const transactionPromise = original.apply(this, args);

        transactionPromise
          .then((transaction: kafkaJs.Transaction) => {
            const originalSend = transaction.send;
            transaction.send = function send(
              this: kafkaJs.Transaction,
              ...args
            ) {
              return context.with(
                trace.setSpan(context.active(), transactionSpan),
                () => {
                  const patched =
                    instrumentation._getSendPatch(kafkaInstance)(originalSend);
                  return patched.apply(this, args).catch(err => {
                    transactionSpan.setStatus({
                      code: SpanStatusCode.ERROR,
                      message: err?.message,
                    });
                    transactionSpan.recordException(err);
                    throw err;
                  });
                }
              );
            };

            const originalSendBatch = transaction.sendBatch;
            transaction.sendBatch = function sendBatch(
              this: kafkaJs.Transaction,
              ...args
            ) {
              return context.with(
                trace.setSpan(context.active(), transactionSpan),
                () => {
                  const patched =
                    instrumentation._getSendBatchPatch(kafkaInstance)(
                      originalSendBatch
                    );
                  return patched.apply(this, args).catch(err => {
                    transactionSpan.setStatus({
                      code: SpanStatusCode.ERROR,
                      message: err?.message,
                    });
                    transactionSpan.recordException(err);
                    throw err;
                  });
                }
              );
            };

            const originalCommit = transaction.commit;
            transaction.commit = function commit(
              this: kafkaJs.Transaction,
              ...args
            ) {
              const originCommitPromise = originalCommit
                .apply(this, args)
                .then(() => {
                  transactionSpan.setStatus({ code: SpanStatusCode.OK });
                });
              return instrumentation._endSpansOnPromise(
                [transactionSpan],
                [],
                originCommitPromise
              );
            };

            const originalAbort = transaction.abort;
            transaction.abort = function abort(
              this: kafkaJs.Transaction,
              ...args
            ) {
              const originAbortPromise = originalAbort.apply(this, args);
              return instrumentation._endSpansOnPromise(
                [transactionSpan],
                [],
                originAbortPromise
              );
            };
          })
          .catch(err => {
            transactionSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: err?.message,
            });
            transactionSpan.recordException(err);
            transactionSpan.end();
          });

        return transactionPromise;
      };
    };
  }

  private _getSendBatchPatch(kafkaInstance?: kafkaJs.Kafka) {
    const instrumentation = this;
    return (
      original: Producer['sendBatch'] | kafkaJs.Transaction['sendBatch']
    ) => {
      return function sendBatch(
        this: kafkaJs.Producer | kafkaJs.Transaction,
        ...args: Parameters<Producer['sendBatch']>
      ): ReturnType<Producer['sendBatch']> {
        const batch = args[0];
        const messages = batch.topicMessages || [];

        const spans: Span[] = [];
        const pendingMetrics: RecordPendingMetric[] = [];

        messages.forEach(topicMessage => {
          topicMessage.messages.forEach(message => {
            spans.push(
              instrumentation._startProducerSpan(
                topicMessage.topic,
                message,
                kafkaInstance
              )
            );
            pendingMetrics.push(
              prepareCounter(instrumentation._sentMessages, 1, {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
                [ATTR_MESSAGING_OPERATION_NAME]: 'send',
                [ATTR_MESSAGING_DESTINATION_NAME]: topicMessage.topic,
                ...(message.partition !== undefined
                  ? {
                      [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(
                        message.partition
                      ),
                    }
                  : {}),
              })
            );
          });
        });
        const origSendResult: Promise<RecordMetadata[]> = original.apply(
          this,
          args
        );
        return instrumentation._endSpansOnPromise(
          spans,
          pendingMetrics,
          origSendResult
        );
      };
    };
  }

  private _getSendPatch(kafkaInstance?: kafkaJs.Kafka) {
    const instrumentation = this;
    return (original: Producer['send'] | kafkaJs.Transaction['send']) => {
      return function send(
        this: Producer | kafkaJs.Transaction,
        ...args: Parameters<Producer['send']>
      ): ReturnType<Producer['send']> {
        const record = args[0];
        const spans: Span[] = record.messages.map(message => {
          return instrumentation._startProducerSpan(
            record.topic,
            message,
            kafkaInstance
          );
        });

        const pendingMetrics: RecordPendingMetric[] = record.messages.map(m =>
          prepareCounter(instrumentation._sentMessages, 1, {
            [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
            [ATTR_MESSAGING_OPERATION_NAME]: 'send',
            [ATTR_MESSAGING_DESTINATION_NAME]: record.topic,
            ...(m.partition !== undefined
              ? {
                  [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(
                    m.partition
                  ),
                }
              : {}),
          })
        );
        const origSendResult: Promise<RecordMetadata[]> = original.apply(
          this,
          args
        );
        return instrumentation._endSpansOnPromise(
          spans,
          pendingMetrics,
          origSendResult
        );
      };
    };
  }

  private _endSpansOnPromise<T>(
    spans: Span[],
    pendingMetrics: RecordPendingMetric[],
    sendPromise: Promise<T>
  ): Promise<T> {
    return Promise.resolve(sendPromise)
      .then(result => {
        pendingMetrics.forEach(m => m());
        return result;
      })
      .catch(reason => {
        let errorMessage: string | undefined;
        let errorType: string = ERROR_TYPE_VALUE_OTHER;
        if (typeof reason === 'string' || reason === undefined) {
          errorMessage = reason;
        } else if (
          typeof reason === 'object' &&
          Object.prototype.hasOwnProperty.call(reason, 'message')
        ) {
          errorMessage = reason.message;
          errorType = reason.constructor.name;
        }
        pendingMetrics.forEach(m => m(errorType));

        spans.forEach(span => {
          span.setAttribute(ATTR_ERROR_TYPE, errorType);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: errorMessage,
          });
        });

        throw reason;
      })
      .finally(() => {
        spans.forEach(span => span.end());
      });
  }

  private _startConsumerSpan({
    topic,
    message,
    operationType,
    ctx,
    link,
    attributes,
    kafkaInstance,
  }: ConsumerSpanOptions) {
    const operationName =
      operationType === MESSAGING_OPERATION_TYPE_VALUE_RECEIVE
        ? 'poll' // for batch processing spans
        : operationType; // for individual message processing spans

    const clusterId = _clusterIdForSpan(kafkaInstance);

    const span = this.tracer.startSpan(
      `${operationName} ${topic}`,
      {
        kind:
          operationType === MESSAGING_OPERATION_TYPE_VALUE_RECEIVE
            ? SpanKind.CLIENT
            : SpanKind.CONSUMER,
        attributes: {
          ...attributes,
          [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
          [ATTR_MESSAGING_OPERATION_TYPE]: operationType,
          [ATTR_MESSAGING_OPERATION_NAME]: operationName,
          [ATTR_MESSAGING_KAFKA_MESSAGE_KEY]: message?.key
            ? String(message.key)
            : undefined,
          [ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE]:
            message?.key && message.value === null ? true : undefined,
          [ATTR_MESSAGING_KAFKA_OFFSET]: message?.offset,
          ...(clusterId !== undefined
            ? { [ATTR_MESSAGING_KAFKA_CLUSTER_ID]: clusterId }
            : {}),
        },
        links: link ? [link] : [],
      },
      ctx
    );

    const { consumerHook } = this.getConfig();
    if (consumerHook && message) {
      safeExecuteInTheMiddle(
        () => consumerHook(span, { topic, message }),
        e => {
          if (e) this._diag.error('consumerHook error', e);
        },
        true
      );
    }

    return span;
  }

  private _startProducerSpan(
    topic: string,
    message: Message,
    kafkaInstance?: kafkaJs.Kafka
  ) {
    const clusterId = _clusterIdForSpan(kafkaInstance);

    const span = this.tracer.startSpan(`send ${topic}`, {
      kind: SpanKind.PRODUCER,
      attributes: {
        [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
        [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        [ATTR_MESSAGING_KAFKA_MESSAGE_KEY]: message.key
          ? String(message.key)
          : undefined,
        [ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE]:
          message.key && message.value === null ? true : undefined,
        [ATTR_MESSAGING_DESTINATION_PARTITION_ID]:
          message.partition !== undefined
            ? String(message.partition)
            : undefined,
        [ATTR_MESSAGING_OPERATION_NAME]: 'send',
        [ATTR_MESSAGING_OPERATION_TYPE]: MESSAGING_OPERATION_TYPE_VALUE_SEND,
        ...(clusterId !== undefined
          ? { [ATTR_MESSAGING_KAFKA_CLUSTER_ID]: clusterId }
          : {}),
      },
    });

    message.headers = message.headers ?? {};
    propagation.inject(trace.setSpan(context.active(), span), message.headers);

    const { producerHook } = this.getConfig();
    if (producerHook) {
      safeExecuteInTheMiddle(
        () => producerHook(span, { topic, message }),
        e => {
          if (e) this._diag.error('producerHook error', e);
        },
        true
      );
    }

    return span;
  }
}
