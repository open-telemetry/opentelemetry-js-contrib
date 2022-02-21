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
  context,
  diag,
  propagation,
  trace,
  Span,
  SpanKind,
  SpanStatusCode,
  ROOT_CONTEXT,
} from '@opentelemetry/api';
import {
  hrTime,
  hrTimeDuration,
  hrTimeToMilliseconds,
} from '@opentelemetry/core';
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import {
  SemanticAttributes,
  MessagingOperationValues,
  MessagingDestinationKindValues,
} from '@opentelemetry/semantic-conventions';
import type * as amqp from 'amqplib';
import {
  AmqplibInstrumentationConfig,
  DEFAULT_CONFIG,
  EndOperation,
} from './types';
import {
  CHANNEL_CONSUME_TIMEOUT_TIMER,
  CHANNEL_SPANS_NOT_ENDED,
  CONNECTION_ATTRIBUTES,
  getConnectionAttributesFromServer,
  getConnectionAttributesFromUrl,
  InstrumentationConsumeChannel,
  InstrumentationMessage,
  InstrumentationPublishChannel,
  isConfirmChannelTracing,
  markConfirmChannelTracing,
  MESSAGE_STORED_SPAN,
  normalizeExchange,
  unmarkConfirmChannelTracing,
} from './utils';
import { VERSION } from './version';

export class AmqplibInstrumentation extends InstrumentationBase<typeof amqp> {
  protected override _config!: AmqplibInstrumentationConfig;

  constructor(config?: AmqplibInstrumentationConfig) {
    super(
      '@opentelemetry/instrumentation-amqplib',
      VERSION,
      Object.assign({}, DEFAULT_CONFIG, config)
    );
  }

  override setConfig(config: AmqplibInstrumentationConfig = {}) {
    this._config = Object.assign({}, DEFAULT_CONFIG, config);
  }

  protected init(): InstrumentationModuleDefinition<typeof amqp> {
    const channelModelModuleFile =
      new InstrumentationNodeModuleFile<amqp.Channel>(
        'amqplib/lib/channel_model.js',
        ['>=0.5.5'],
        this.patchChannelModel.bind(this),
        this.unpatchChannelModel.bind(this)
      );

    const callbackModelModuleFile =
      new InstrumentationNodeModuleFile<amqp.Channel>(
        'amqplib/lib/callback_model.js',
        ['>=0.5.5'],
        this.patchChannelModel.bind(this),
        this.unpatchChannelModel.bind(this)
      );

    const connectModuleFile = new InstrumentationNodeModuleFile<amqp.Channel>(
      'amqplib/lib/connect.js',
      ['>=0.5.5'],
      this.patchConnect.bind(this),
      this.unpatchConnect.bind(this)
    );

    const module = new InstrumentationNodeModuleDefinition<typeof amqp>(
      'amqplib',
      ['>=0.5.5'],
      undefined,
      undefined,
      [channelModelModuleFile, connectModuleFile, callbackModelModuleFile]
    );
    return module;
  }

  private patchConnect(moduleExports: any) {
    moduleExports = this.unpatchConnect(moduleExports);
    if (!isWrapped(moduleExports.connect)) {
      this._wrap(moduleExports, 'connect', this.getConnectPatch.bind(this));
    }
    return moduleExports;
  }

  private unpatchConnect(moduleExports: any) {
    if (isWrapped(moduleExports.connect)) {
      this._unwrap(moduleExports, 'connect');
    }
    return moduleExports;
  }

  private patchChannelModel(
    moduleExports: any,
    moduleVersion: string | undefined
  ) {
    if (!isWrapped(moduleExports.Channel.prototype.publish)) {
      this._wrap(
        moduleExports.Channel.prototype,
        'publish',
        this.getPublishPatch.bind(this, moduleVersion)
      );
    }
    if (!isWrapped(moduleExports.Channel.prototype.consume)) {
      this._wrap(
        moduleExports.Channel.prototype,
        'consume',
        this.getConsumePatch.bind(this, moduleVersion)
      );
    }
    if (!isWrapped(moduleExports.Channel.prototype.ack)) {
      this._wrap(
        moduleExports.Channel.prototype,
        'ack',
        this.getAckPatch.bind(this, false, EndOperation.Ack)
      );
    }
    if (!isWrapped(moduleExports.Channel.prototype.nack)) {
      this._wrap(
        moduleExports.Channel.prototype,
        'nack',
        this.getAckPatch.bind(this, true, EndOperation.Nack)
      );
    }
    if (!isWrapped(moduleExports.Channel.prototype.reject)) {
      this._wrap(
        moduleExports.Channel.prototype,
        'reject',
        this.getAckPatch.bind(this, true, EndOperation.Reject)
      );
    }
    if (!isWrapped(moduleExports.Channel.prototype.ackAll)) {
      this._wrap(
        moduleExports.Channel.prototype,
        'ackAll',
        this.getAckAllPatch.bind(this, false, EndOperation.AckAll)
      );
    }
    if (!isWrapped(moduleExports.Channel.prototype.nackAll)) {
      this._wrap(
        moduleExports.Channel.prototype,
        'nackAll',
        this.getAckAllPatch.bind(this, true, EndOperation.NackAll)
      );
    }
    if (!isWrapped(moduleExports.Channel.prototype.emit)) {
      this._wrap(
        moduleExports.Channel.prototype,
        'emit',
        this.getChannelEmitPatch.bind(this)
      );
    }
    if (!isWrapped(moduleExports.ConfirmChannel.prototype.publish)) {
      this._wrap(
        moduleExports.ConfirmChannel.prototype,
        'publish',
        this.getConfirmedPublishPatch.bind(this, moduleVersion)
      );
    }
    return moduleExports;
  }

  private unpatchChannelModel(moduleExports: any) {
    if (isWrapped(moduleExports.Channel.prototype.publish)) {
      this._unwrap(moduleExports.Channel.prototype, 'publish');
    }
    if (isWrapped(moduleExports.Channel.prototype.consume)) {
      this._unwrap(moduleExports.Channel.prototype, 'consume');
    }
    if (isWrapped(moduleExports.Channel.prototype.ack)) {
      this._unwrap(moduleExports.Channel.prototype, 'ack');
    }
    if (isWrapped(moduleExports.Channel.prototype.nack)) {
      this._unwrap(moduleExports.Channel.prototype, 'nack');
    }
    if (isWrapped(moduleExports.Channel.prototype.reject)) {
      this._unwrap(moduleExports.Channel.prototype, 'reject');
    }
    if (isWrapped(moduleExports.Channel.prototype.ackAll)) {
      this._unwrap(moduleExports.Channel.prototype, 'ackAll');
    }
    if (isWrapped(moduleExports.Channel.prototype.nackAll)) {
      this._unwrap(moduleExports.Channel.prototype, 'nackAll');
    }
    if (isWrapped(moduleExports.Channel.prototype.emit)) {
      this._unwrap(moduleExports.Channel.prototype, 'emit');
    }
    if (isWrapped(moduleExports.ConfirmChannel.prototype.publish)) {
      this._unwrap(moduleExports.ConfirmChannel.prototype, 'publish');
    }
    return moduleExports;
  }

  private getConnectPatch(
    original: (
      url: string | amqp.Options.Connect,
      socketOptions: any,
      openCallback: (err: any, connection: amqp.Connection) => void
    ) => amqp.Connection
  ) {
    return function patchedConnect(
      this: unknown,
      url: string | amqp.Options.Connect,
      socketOptions: any,
      openCallback: Function
    ) {
      return original.call(
        this,
        url,
        socketOptions,
        function (this: unknown, err, conn: amqp.Connection) {
          if (err == null) {
            const urlAttributes = getConnectionAttributesFromUrl(url);
            // the type of conn in @types/amqplib is amqp.Connection, but in practice the library send the
            // `serverProperties` on the `conn` and not in a property `connection`.
            // I don't have capacity to debug it currently but it should probably be fixed in @types or
            // in the package itself
            // currently setting as any to calm typescript
            const serverAttributes = getConnectionAttributesFromServer(
              conn as any
            );
            (conn as any)[CONNECTION_ATTRIBUTES] = {
              ...urlAttributes,
              ...serverAttributes,
            };
          }
          openCallback.apply(this, arguments);
        }
      );
    };
  }

  private getChannelEmitPatch(original: Function) {
    const self = this;
    return function emit(
      this: InstrumentationConsumeChannel,
      eventName: string
    ) {
      if (eventName === 'close') {
        self.endAllSpansOnChannel(
          this,
          true,
          EndOperation.ChannelClosed,
          undefined
        );
        const activeTimer = this[CHANNEL_CONSUME_TIMEOUT_TIMER];
        if (activeTimer) {
          clearInterval(activeTimer);
        }
        this[CHANNEL_CONSUME_TIMEOUT_TIMER] = undefined;
      } else if (eventName === 'error') {
        self.endAllSpansOnChannel(
          this,
          true,
          EndOperation.ChannelError,
          undefined
        );
      }
      return original.apply(this, arguments);
    };
  }

  private getAckAllPatch(
    isRejected: boolean,
    endOperation: EndOperation,
    original: Function
  ) {
    const self = this;
    return function ackAll(
      this: InstrumentationConsumeChannel,
      requeueOrEmpty?: boolean
    ): void {
      self.endAllSpansOnChannel(this, isRejected, endOperation, requeueOrEmpty);
      return original.apply(this, arguments);
    };
  }

  private getAckPatch(
    isRejected: boolean,
    endOperation: EndOperation,
    original: Function
  ) {
    const self = this;
    return function ack(
      this: InstrumentationConsumeChannel,
      message: amqp.Message,
      allUpToOrRequeue?: boolean,
      requeue?: boolean
    ): void {
      const channel = this;
      // we use this patch in reject function as well, but it has different signature
      const requeueResolved =
        endOperation === EndOperation.Reject ? allUpToOrRequeue : requeue;

      const spansNotEnded: { msg: amqp.Message }[] =
        channel[CHANNEL_SPANS_NOT_ENDED] ?? [];
      const msgIndex = spansNotEnded.findIndex(
        msgDetails => msgDetails.msg === message
      );
      if (msgIndex < 0) {
        // should not happen in happy flow
        // but possible if user is calling the api function ack twice with same message
        self.endConsumerSpan(
          message,
          isRejected,
          endOperation,
          requeueResolved
        );
      } else if (endOperation !== EndOperation.Reject && allUpToOrRequeue) {
        for (let i = 0; i <= msgIndex; i++) {
          self.endConsumerSpan(
            spansNotEnded[i].msg,
            isRejected,
            endOperation,
            requeueResolved
          );
        }
        spansNotEnded.splice(0, msgIndex + 1);
      } else {
        self.endConsumerSpan(
          message,
          isRejected,
          endOperation,
          requeueResolved
        );
        spansNotEnded.splice(msgIndex, 1);
      }
      return original.apply(this, arguments);
    };
  }

  protected getConsumePatch(
    moduleVersion: string | undefined,
    original: Function
  ) {
    const self = this;
    return function consume(
      this: InstrumentationConsumeChannel,
      queue: string,
      onMessage: (msg: amqp.ConsumeMessage | null) => void,
      options?: amqp.Options.Consume
    ): Promise<amqp.Replies.Consume> {
      const channel = this;
      if (
        !Object.prototype.hasOwnProperty.call(channel, CHANNEL_SPANS_NOT_ENDED)
      ) {
        if (self._config.consumeTimeoutMs) {
          const timer = setInterval(() => {
            self.checkConsumeTimeoutOnChannel(channel);
          }, self._config.consumeTimeoutMs);
          timer.unref();
          channel[CHANNEL_CONSUME_TIMEOUT_TIMER] = timer;
        }
        channel[CHANNEL_SPANS_NOT_ENDED] = [];
      }

      const patchedOnMessage = function (
        this: unknown,
        msg: InstrumentationMessage | null
      ) {
        // msg is expected to be null for signaling consumer cancel notification
        // https://www.rabbitmq.com/consumer-cancel.html
        // in this case, we do not start a span, as this is not a real message.
        if (!msg) {
          return onMessage.call(this, msg);
        }

        const headers = msg.properties.headers ?? {};
        const parentContext = propagation.extract(ROOT_CONTEXT, headers);
        const exchange = msg.fields?.exchange;
        const span = self.tracer.startSpan(
          `${queue} process`,
          {
            kind: SpanKind.CONSUMER,
            attributes: {
              ...channel?.connection?.[CONNECTION_ATTRIBUTES],
              [SemanticAttributes.MESSAGING_DESTINATION]: exchange,
              [SemanticAttributes.MESSAGING_DESTINATION_KIND]:
                MessagingDestinationKindValues.TOPIC,
              [SemanticAttributes.MESSAGING_RABBITMQ_ROUTING_KEY]:
                msg.fields?.routingKey,
              [SemanticAttributes.MESSAGING_OPERATION]:
                MessagingOperationValues.PROCESS,
              [SemanticAttributes.MESSAGING_MESSAGE_ID]:
                msg?.properties.messageId,
              [SemanticAttributes.MESSAGING_CONVERSATION_ID]:
                msg?.properties.correlationId,
            },
          },
          parentContext
        );

        if (self._config.consumeHook) {
          safeExecuteInTheMiddle(
            () => self._config.consumeHook!(span, { moduleVersion, msg }),
            e => {
              if (e) {
                diag.error('amqplib instrumentation: consumerHook error', e);
              }
            },
            true
          );
        }

        if (!options?.noAck) {
          // store the message on the channel so we can close the span on ackAll etc
          channel[CHANNEL_SPANS_NOT_ENDED]!.push({
            msg,
            timeOfConsume: hrTime(),
          });

          // store the span on the message, so we can end it when user call 'ack' on it
          msg[MESSAGE_STORED_SPAN] = span;
        }

        context.with(trace.setSpan(context.active(), span), () => {
          onMessage.call(this, msg);
        });

        if (options?.noAck) {
          self.callConsumeEndHook(span, msg, false, EndOperation.AutoAck);
          span.end();
        }
      };
      arguments[1] = patchedOnMessage;
      return original.apply(this, arguments);
    };
  }

  protected getConfirmedPublishPatch(
    moduleVersion: string | undefined,
    original: Function
  ) {
    const self = this;
    return function confirmedPublish(
      this: InstrumentationConsumeChannel,
      exchange: string,
      routingKey: string,
      content: Buffer,
      options?: amqp.Options.Publish,
      callback?: (err: any, ok: amqp.Replies.Empty) => void
    ): boolean {
      const channel = this;
      const { span, modifiedOptions } = self.createPublishSpan(
        self,
        exchange,
        routingKey,
        channel,
        options
      );

      if (self._config.publishHook) {
        safeExecuteInTheMiddle(
          () =>
            self._config.publishHook!(span, {
              moduleVersion,
              exchange,
              routingKey,
              content,
              options: modifiedOptions,
              isConfirmChannel: true,
            }),
          e => {
            if (e) {
              diag.error('amqplib instrumentation: publishHook error', e);
            }
          },
          true
        );
      }

      const patchedOnConfirm = function (
        this: unknown,
        err: any,
        ok: amqp.Replies.Empty
      ) {
        try {
          callback?.call(this, err, ok);
        } finally {
          if (self._config.publishConfirmHook) {
            safeExecuteInTheMiddle(
              () =>
                self._config.publishConfirmHook!(span, {
                  moduleVersion,
                  exchange,
                  routingKey,
                  content,
                  options,
                  isConfirmChannel: true,
                  confirmError: err,
                }),
              e => {
                if (e) {
                  diag.error(
                    'amqplib instrumentation: publishConfirmHook error',
                    e
                  );
                }
              },
              true
            );
          }

          if (err) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: "message confirmation has been nack'ed",
            });
          }
          span.end();
        }
      };

      // calling confirm channel publish function is storing the message in queue and registering the callback for broker confirm.
      // span ends in the patched callback.
      const markedContext = markConfirmChannelTracing(context.active());
      const argumentsCopy = [...arguments];
      argumentsCopy[3] = modifiedOptions;
      argumentsCopy[4] = context.bind(
        unmarkConfirmChannelTracing(trace.setSpan(markedContext, span)),
        patchedOnConfirm
      );
      return context.with(markedContext, original.bind(this, ...argumentsCopy));
    };
  }

  protected getPublishPatch(
    moduleVersion: string | undefined,
    original: Function
  ) {
    const self = this;
    return function publish(
      this: InstrumentationPublishChannel,
      exchange: string,
      routingKey: string,
      content: Buffer,
      options?: amqp.Options.Publish
    ): boolean {
      if (isConfirmChannelTracing(context.active())) {
        // work already done
        return original.apply(this, arguments);
      } else {
        const channel = this;
        const { span, modifiedOptions } = self.createPublishSpan(
          self,
          exchange,
          routingKey,
          channel,
          options
        );

        if (self._config.publishHook) {
          safeExecuteInTheMiddle(
            () =>
              self._config.publishHook!(span, {
                moduleVersion,
                exchange,
                routingKey,
                content,
                options: modifiedOptions,
                isConfirmChannel: false,
              }),
            e => {
              if (e) {
                diag.error('amqplib instrumentation: publishHook error', e);
              }
            },
            true
          );
        }

        // calling normal channel publish function is only storing the message in queue.
        // it does not send it and waits for an ack, so the span duration is expected to be very short.
        const argumentsCopy = [...arguments];
        argumentsCopy[3] = modifiedOptions;
        const originalRes = original.apply(this, argumentsCopy as any);
        span.end();
        return originalRes;
      }
    };
  }

  private createPublishSpan(
    self: this,
    exchange: string,
    routingKey: string,
    channel: InstrumentationPublishChannel,
    options?: amqp.Options.Publish
  ) {
    const normalizedExchange = normalizeExchange(exchange);

    const span = self.tracer.startSpan(
      `${normalizedExchange} -> ${routingKey} send`,
      {
        kind: SpanKind.PRODUCER,
        attributes: {
          ...channel.connection[CONNECTION_ATTRIBUTES],
          [SemanticAttributes.MESSAGING_DESTINATION]: exchange,
          [SemanticAttributes.MESSAGING_DESTINATION_KIND]:
            MessagingDestinationKindValues.TOPIC,
          [SemanticAttributes.MESSAGING_RABBITMQ_ROUTING_KEY]: routingKey,
          [SemanticAttributes.MESSAGING_MESSAGE_ID]: options?.messageId,
          [SemanticAttributes.MESSAGING_CONVERSATION_ID]:
            options?.correlationId,
        },
      }
    );
    const modifiedOptions = options ?? {};
    modifiedOptions.headers = modifiedOptions.headers ?? {};

    propagation.inject(
      trace.setSpan(context.active(), span),
      modifiedOptions.headers
    );

    return { span, modifiedOptions };
  }

  private endConsumerSpan(
    message: InstrumentationMessage,
    isRejected: boolean | null,
    operation: EndOperation,
    requeue: boolean | undefined
  ) {
    const storedSpan: Span | undefined = message[MESSAGE_STORED_SPAN];
    if (!storedSpan) return;
    if (isRejected !== false) {
      storedSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message:
          operation !== EndOperation.ChannelClosed &&
          operation !== EndOperation.ChannelError
            ? `${operation} called on message${
                requeue === true
                  ? ' with requeue'
                  : requeue === false
                  ? ' without requeue'
                  : ''
              }`
            : operation,
      });
    }
    this.callConsumeEndHook(storedSpan, message, isRejected, operation);
    storedSpan.end();
    message[MESSAGE_STORED_SPAN] = undefined;
  }

  private endAllSpansOnChannel(
    channel: InstrumentationConsumeChannel,
    isRejected: boolean,
    operation: EndOperation,
    requeue: boolean | undefined
  ) {
    const spansNotEnded: { msg: amqp.Message }[] =
      channel[CHANNEL_SPANS_NOT_ENDED] ?? [];
    spansNotEnded.forEach(msgDetails => {
      this.endConsumerSpan(msgDetails.msg, isRejected, operation, requeue);
    });
    channel[CHANNEL_SPANS_NOT_ENDED] = [];
  }

  private callConsumeEndHook(
    span: Span,
    msg: amqp.ConsumeMessage,
    rejected: boolean | null,
    endOperation: EndOperation
  ) {
    if (!this._config.consumeEndHook) return;

    safeExecuteInTheMiddle(
      () => this._config.consumeEndHook!(span, { msg, rejected, endOperation }),
      e => {
        if (e) {
          diag.error('amqplib instrumentation: consumerEndHook error', e);
        }
      },
      true
    );
  }

  private checkConsumeTimeoutOnChannel(channel: InstrumentationConsumeChannel) {
    const currentTime = hrTime();
    const spansNotEnded = channel[CHANNEL_SPANS_NOT_ENDED] ?? [];
    let i: number;
    for (i = 0; i < spansNotEnded.length; i++) {
      const currMessage = spansNotEnded[i];
      const timeFromConsume = hrTimeDuration(
        currMessage.timeOfConsume,
        currentTime
      );
      if (
        hrTimeToMilliseconds(timeFromConsume) < this._config.consumeTimeoutMs!
      ) {
        break;
      }
      this.endConsumerSpan(
        currMessage.msg,
        null,
        EndOperation.InstrumentationTimeout,
        true
      );
    }
    spansNotEnded.splice(0, i);
  }
}
