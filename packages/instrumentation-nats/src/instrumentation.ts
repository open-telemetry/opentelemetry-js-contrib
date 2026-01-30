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
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { NatsInstrumentationConfig } from './types';
import type * as nats from 'nats';
import {
  Attributes,
  Context,
  context,
  Counter,
  propagation,
  ROOT_CONTEXT,
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { natsHeadersGetter, natsHeadersSetter } from './propagator';
import {
  ATTR_MESSAGING_CONSUMER_GROUP_NAME,
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_DESTINATION_TEMPORARY,
  ATTR_MESSAGING_MESSAGE_BODY_SIZE,
  ATTR_MESSAGING_MESSAGE_CONVERSATION_ID,
  ATTR_MESSAGING_OPERATION_NAME,
  ATTR_MESSAGING_OPERATION_TYPE,
  ATTR_MESSAGING_SYSTEM,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
  MESSAGING_OPERATION_TYPE_VALUE_PUBLISH,
  MESSAGING_SYSTEM_VALUE_NATS,
  METRIC_MESSAGING_CLIENT_RECEIVED_MESSAGES,
  METRIC_MESSAGING_CLIENT_SENT_MESSAGES,
} from './semconv';

let natsHeaders: typeof nats.headers | undefined;

interface SentMessagesAttributes extends Attributes {
  [ATTR_MESSAGING_SYSTEM]: string;
  [ATTR_MESSAGING_DESTINATION_NAME]: string;
  [ATTR_MESSAGING_OPERATION_NAME]: string;
}

interface ReceivedMessagesAttributes extends Attributes {
  [ATTR_MESSAGING_SYSTEM]: string;
  [ATTR_MESSAGING_DESTINATION_NAME]: string;
  [ATTR_MESSAGING_OPERATION_NAME]: string;
}

export class NatsInstrumentation extends InstrumentationBase<NatsInstrumentationConfig> {
  private _sentMessages!: Counter<SentMessagesAttributes>;
  private _receivedMessages!: Counter<ReceivedMessagesAttributes>;

  constructor(config: NatsInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  override _updateMetricInstruments() {
    this._sentMessages = this.meter.createCounter(
      METRIC_MESSAGING_CLIENT_SENT_MESSAGES
    );
    this._receivedMessages = this.meter.createCounter(
      METRIC_MESSAGING_CLIENT_RECEIVED_MESSAGES
    );
  }

  protected init() {
    return new InstrumentationNodeModuleDefinition(
      'nats',
      ['>=2 <3'],
      this._patch.bind(this),
      this._unpatch.bind(this)
    );
  }

  private _patch(
    moduleExports: typeof nats,
    _moduleVersion: string | undefined
  ): typeof nats {
    natsHeaders = moduleExports.headers;

    this._wrap(moduleExports, 'connect', this._getConnectPatch());
    return moduleExports;
  }

  private _unpatch(
    moduleExports: typeof nats,
    _moduleVersion: string | undefined
  ): void {
    if (isWrapped(moduleExports.connect)) {
      this._unwrap(moduleExports, 'connect');
    }
    natsHeaders = undefined;
  }

  private _getConnectPatch() {
    const instrumentation = this;
    return (original: typeof nats.connect) => {
      return async function connect(
        this: unknown,
        ...args: Parameters<typeof nats.connect>
      ): Promise<nats.NatsConnection> {
        const nc = await original.apply(this, args);

        if (isWrapped(nc.publish)) {
          instrumentation._unwrap(nc, 'publish');
        }
        instrumentation._wrap(
          nc,
          'publish',
          instrumentation._getPublishPatch(nc)
        );

        if (isWrapped(nc.request)) {
          instrumentation._unwrap(nc, 'request');
        }
        instrumentation._wrap(
          nc,
          'request',
          instrumentation._getRequestPatch(nc)
        );

        if (isWrapped(nc.subscribe)) {
          instrumentation._unwrap(nc, 'subscribe');
        }
        instrumentation._wrap(
          nc,
          'subscribe',
          instrumentation._getSubscribePatch(nc)
        );

        return nc;
      };
    };
  }

  private _getPublishPatch(nc: nats.NatsConnection) {
    const instrumentation = this;
    return (original: nats.NatsConnection['publish']) => {
      return function publish(
        this: nats.NatsConnection,
        subject: string,
        data?: nats.Payload,
        options?: nats.PublishOptions
      ): void {
        if (options?.reply !== undefined) {
          return original.call(this, subject, data, options);
        }

        const span = instrumentation._startProducerSpan(
          nc,
          subject,
          data,
          options,
          {
            [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
          }
        );
        const headers = instrumentation._injectContext(span, options?.headers);

        instrumentation._callPublishHook(span, subject, data);

        try {
          original.call(this, subject, data, { ...options, headers });
          span.setStatus({ code: SpanStatusCode.OK });

          instrumentation._sentMessages?.add(1, {
            [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_NATS,
            [ATTR_MESSAGING_DESTINATION_NAME]: subject,
            [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
          });
        } catch (err: any) {
          span.recordException(err);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err?.message,
          });
          throw err;
        } finally {
          span.end();
        }
      };
    };
  }

  private _getRequestPatch(nc: nats.NatsConnection) {
    const instrumentation = this;
    return (original: nats.NatsConnection['request']) => {
      return async function request(
        this: nats.NatsConnection,
        subject: string,
        data?: nats.Payload,
        opts?: nats.RequestOptions
      ): Promise<nats.Msg> {
        const span = instrumentation._startProducerSpan(
          nc,
          subject,
          data,
          opts,
          {
            [ATTR_MESSAGING_OPERATION_NAME]: 'request',
          }
        );

        const headers = instrumentation._injectContext(span, opts?.headers);

        instrumentation._callPublishHook(span, subject, data);

        try {
          const response = await original.call(this, subject, data, {
            ...opts,
            headers,
          } as nats.RequestOptions);
          span.setStatus({ code: SpanStatusCode.OK });

          instrumentation._sentMessages?.add(1, {
            [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_NATS,
            [ATTR_MESSAGING_DESTINATION_NAME]: subject,
            [ATTR_MESSAGING_OPERATION_NAME]: 'request',
          });
          return response;
        } catch (err: any) {
          span.recordException(err);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err?.message,
          });
          throw err;
        } finally {
          span.end();
        }
      };
    };
  }

  private _getSubscribePatch(nc: nats.NatsConnection) {
    const instrumentation = this;
    return (original: nats.NatsConnection['subscribe']) => {
      return function subscribe(
        this: nats.NatsConnection,
        subject: string,
        opts?: nats.SubscriptionOptions
      ): nats.Subscription {
        const queueGroup = opts?.queue;

        if (opts?.callback) {
          const originalCallback = opts.callback;
          opts.callback = function wrappedCallback(
            err: nats.NatsError | null,
            msg: nats.Msg
          ) {
            if (err) {
              return originalCallback(err, msg);
            }

            const [ctx, span] = instrumentation._startConsumerSpan(
              nc,
              msg,
              queueGroup
            );
            instrumentation._callConsumeHook(span, msg);
            const wrappedMsg = instrumentation._wrapMessage(msg, nc);

            try {
              context.with(ctx, () => {
                originalCallback(err, wrappedMsg);
              });
              span.setStatus({ code: SpanStatusCode.OK });

              instrumentation._receivedMessages?.add(1, {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_NATS,
                [ATTR_MESSAGING_DESTINATION_NAME]: msg.subject,
                [ATTR_MESSAGING_OPERATION_NAME]: 'process',
              });
            } catch (err: any) {
              span.recordException(err);
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: err?.message,
              });
              throw err;
            } finally {
              span.end();
            }
          };
        }

        const sub = original.call(this, subject, opts);

        if (opts?.callback) {
          return sub;
        }

        const originalIterator = sub[Symbol.asyncIterator].bind(sub);

        sub[Symbol.asyncIterator] = function (): AsyncIterator<nats.Msg> {
          const iterator = originalIterator();

          return {
            async next(): Promise<IteratorResult<nats.Msg>> {
              const result = await iterator.next();

              if (result.done) {
                return result;
              }

              const msg = result.value;
              const [_ctx, span] = instrumentation._startConsumerSpan(
                nc,
                msg,
                queueGroup
              );
              const wrappedMsg = instrumentation._wrapMessage(msg, nc);
              instrumentation._callConsumeHook(span, msg);

              // Note: We cannot set context for the code that processes the message
              // in async iterator mode. This is a known limitation.
              // See: https://github.com/open-telemetry/opentelemetry-js-api/issues/123
              span.end();

              instrumentation._receivedMessages?.add(1, {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_NATS,
                [ATTR_MESSAGING_DESTINATION_NAME]: msg.subject,
                [ATTR_MESSAGING_OPERATION_NAME]: 'process',
              });

              return { done: false, value: wrappedMsg };
            },

            async return(value?: unknown): Promise<IteratorResult<nats.Msg>> {
              return (
                iterator.return?.(value) ?? { done: true, value: undefined }
              );
            },

            async throw(e?: unknown): Promise<IteratorResult<nats.Msg>> {
              return iterator.throw?.(e) ?? { done: true, value: undefined };
            },
          };
        };

        return sub;
      };
    };
  }

  private _wrapMessage(msg: nats.Msg, nc: nats.NatsConnection): nats.Msg {
    const instrumentation = this;

    return new Proxy(msg, {
      get(target, prop, receiver) {
        if (prop === 'respond') {
          return instrumentation._getRespondPatch(target, nc);
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  private _getRespondPatch(msg: nats.Msg, nc: nats.NatsConnection) {
    const instrumentation = this;
    const originalRespond = msg.respond.bind(msg);

    return function respond(
      data?: nats.Payload,
      opts?: nats.PublishOptions
    ): boolean {
      if (!msg.reply) {
        return originalRespond(data, opts);
      }

      const attributes: Attributes = {
        [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_NATS,
        [ATTR_MESSAGING_DESTINATION_NAME]: msg.reply,
        [ATTR_MESSAGING_OPERATION_TYPE]: MESSAGING_OPERATION_TYPE_VALUE_PUBLISH,
        [ATTR_MESSAGING_OPERATION_NAME]: 'respond',
        [ATTR_MESSAGING_DESTINATION_TEMPORARY]: true,
        [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: msg.reply,
        ...instrumentation._getServerAttributes(nc),
      };

      if (instrumentation.getConfig().includeMessageBodySize && data) {
        attributes[ATTR_MESSAGING_MESSAGE_BODY_SIZE] =
          data instanceof Uint8Array ? data.length : String(data).length;
      }

      const span = instrumentation.tracer.startSpan(`send ${msg.reply}`, {
        kind: SpanKind.PRODUCER,
        attributes,
      });

      const headers = instrumentation._injectContext(span, opts?.headers);

      try {
        const result = originalRespond(data, { ...opts, headers });
        span.setStatus({ code: SpanStatusCode.OK });

        instrumentation._sentMessages?.add(1, {
          [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_NATS,
          [ATTR_MESSAGING_DESTINATION_NAME]: msg.reply!,
          [ATTR_MESSAGING_OPERATION_NAME]: 'respond',
        });
        return result;
      } catch (err: any) {
        span.recordException(err);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err?.message,
        });
        throw err;
      } finally {
        span.end();
      }
    };
  }

  private _getServerAttributes(nc: nats.NatsConnection): Attributes {
    const info = nc.info;
    if (!info) {
      return {};
    }

    const attributes: Attributes = {};

    if (info.host) {
      attributes[ATTR_SERVER_ADDRESS] = info.host;
    }

    if (info.port) {
      attributes[ATTR_SERVER_PORT] = info.port;
    }

    return attributes;
  }

  private _startProducerSpan(
    nc: nats.NatsConnection,
    subject: string,
    data?: nats.Payload,
    options?: nats.PublishOptions | nats.RequestOptions,
    additionalAttributes?: Attributes
  ): Span {
    const attributes: Attributes = {
      [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_NATS,
      [ATTR_MESSAGING_DESTINATION_NAME]: subject,
      [ATTR_MESSAGING_OPERATION_TYPE]: MESSAGING_OPERATION_TYPE_VALUE_PUBLISH,
      [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
      ...this._getServerAttributes(nc),
      ...additionalAttributes,
    };

    if (this.getConfig().includeMessageBodySize && data) {
      attributes[ATTR_MESSAGING_MESSAGE_BODY_SIZE] =
        data instanceof Uint8Array ? data.length : String(data).length;
    }

    if (options && 'reply' in options && options.reply) {
      attributes[ATTR_MESSAGING_MESSAGE_CONVERSATION_ID] = options.reply;
    }

    return this.tracer.startSpan(`send ${subject}`, {
      kind: SpanKind.PRODUCER,
      attributes,
    });
  }

  private _startConsumerSpan(
    nc: nats.NatsConnection,
    msg: nats.Msg,
    queueGroup?: string
  ): [Context, Span] {
    const parentContext = propagation.extract(
      ROOT_CONTEXT,
      msg.headers,
      natsHeadersGetter
    );

    const attributes: Attributes = {
      [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_NATS,
      [ATTR_MESSAGING_DESTINATION_NAME]: msg.subject,
      [ATTR_MESSAGING_OPERATION_TYPE]: MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
      [ATTR_MESSAGING_OPERATION_NAME]: 'process',
      ...this._getServerAttributes(nc),
    };

    if (this.getConfig().includeMessageBodySize && msg.data) {
      attributes[ATTR_MESSAGING_MESSAGE_BODY_SIZE] = msg.data.length;
    }

    if (msg.reply) {
      attributes[ATTR_MESSAGING_MESSAGE_CONVERSATION_ID] = msg.reply;
    }

    if (queueGroup) {
      attributes[ATTR_MESSAGING_CONSUMER_GROUP_NAME] = queueGroup;
    }

    const span = this.tracer.startSpan(
      `process ${msg.subject}`,
      {
        kind: SpanKind.CONSUMER,
        attributes,
      },
      parentContext
    );

    const ctx = trace.setSpan(parentContext, span);
    return [ctx, span];
  }

  private _injectContext(
    span: Span,
    existingHeaders?: nats.MsgHdrs
  ): nats.MsgHdrs | undefined {
    const headers = existingHeaders ?? natsHeaders?.();
    if (!headers) {
      return;
    }

    const ctx = trace.setSpan(context.active(), span);
    propagation.inject(ctx, headers, natsHeadersSetter);

    return headers;
  }

  private _callPublishHook(
    span: Span,
    subject: string,
    data?: nats.Payload
  ): void {
    const { publishHook } = this.getConfig();
    if (publishHook) {
      safeExecuteInTheMiddle(
        () =>
          publishHook(span, {
            subject,
            data: data as Uint8Array | string | undefined,
          }),
        e => {
          if (e) this._diag.error('publishHook error', e);
        },
        true
      );
    }
  }

  private _callConsumeHook(span: Span, message: nats.Msg): void {
    const { consumeHook } = this.getConfig();
    if (consumeHook) {
      safeExecuteInTheMiddle(
        () => consumeHook(span, { message }),
        e => {
          if (e) this._diag.error('consumeHook error', e);
        },
        true
      );
    }
  }
}
