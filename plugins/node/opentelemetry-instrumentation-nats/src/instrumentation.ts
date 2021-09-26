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
  propagation,
  trace,
  context,
  SpanKind,
  SpanStatusCode,
  Context,
  Span,
  ROOT_CONTEXT,
} from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type * as Nats from 'nats';
import { NatsInstrumentationConfig } from './types';
import * as utils from './utils';
import { VERSION } from './version';

interface NatsHelpers {
  /** Tracks which subjects are reply addresses */
  replySubjects: Set<string>;
  headers?: () => Nats.MsgHdrs;
}

/**
 * Nats instrumentation for Opentelemetry
 */
export class NatsInstrumentation extends InstrumentationBase<typeof Nats> {
  constructor(protected override _config: NatsInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-nats', VERSION, _config);
    this._natsHelpers = {
      replySubjects: new Set(),
    };
  }

  _natsHelpers: NatsHelpers;

  init(): InstrumentationNodeModuleDefinition<typeof Nats> {
    return new InstrumentationNodeModuleDefinition<typeof Nats>(
      'nats',
      ['2.*'],
      (moduleExports, moduleVersion) => {
        diag.debug(`Applying nats patch for nats@${moduleVersion}`);
        const { headers } = moduleExports;
        // Grab helpers from nats moduleExports for wrappings in the future
        this._natsHelpers.headers = headers;
        this.ensureWrapped(
          moduleVersion,
          moduleExports,
          'connect',
          this.wrapConnect.bind(this)
        );
        return moduleExports;
      },
      (moduleExports, moduleVersion) => {
        if (moduleExports === undefined) return;
        this._unwrap(moduleExports, 'connect');
        diag.debug(`Removing nats patch for nats@${moduleVersion}`);
      }
    );
  }

  private wrapConnect(originalFunc: typeof import('nats').connect) {
    const instrumentation = this;
    const traps = {
      get: function get(target: Nats.NatsConnection, prop: string) {
        switch (prop) {
          case 'subscribe':
            return instrumentation.wrapSubscribe(target.subscribe);
          case 'publish':
            return instrumentation.wrapPublish(target.publish);
          case 'request':
            return instrumentation.wrapRequest(target.request);
          default:
            return (target as any)[prop];
        }
      },
    };
    return async function connect(
      opts?: Nats.ConnectionOptions | undefined
    ): Promise<Nats.NatsConnection> {
      const nc = await originalFunc(opts);
      return new Proxy(nc, traps);
    };
  }

  private wrapSubscribe(originalFunc: Nats.NatsConnection['subscribe']) {
    const instrumentation = this;
    return function subscribe(
      this: Nats.NatsConnection,
      subject: string,
      opts?: Nats.SubscriptionOptions
    ): Nats.Subscription {
      const nc = this;
      const genSpanAndContextFromMessage = (m: Nats.Msg): [Context, Span] => {
        // Extract propagation info from nats header
        const parentContext = propagation.extract(
          ROOT_CONTEXT,
          m.headers,
          utils.natsContextGetter
        );
        const span = instrumentation.tracer.startSpan(
          `${m.subject} process`,
          {
            attributes: {
              ...utils.traceAttrs(nc.info, m),
              [SemanticAttributes.MESSAGING_OPERATION]: 'process',
              [SemanticAttributes.MESSAGING_DESTINATION_KIND]: 'topic',
            },
            // If the message has a reply address, assume it's seeking
            // a response from us
            kind: m.reply ? SpanKind.SERVER : SpanKind.CONSUMER,
          },
          parentContext
        );
        const ctx = trace.setSpan(parentContext, span);
        return [ctx, span];
      };

      if (opts?.callback) {
        const originalCallback = opts.callback;
        opts.callback = function wrappedCallback(
          err: Nats.NatsError | null,
          msg: Nats.Msg
        ) {
          if (err) {
            // If there was an error with Nats, bail early
            originalCallback(err, msg);
            return;
          }

          msg = instrumentation.setupMessage(msg, nc);
          const [ctx, span] = genSpanAndContextFromMessage(msg);
          try {
            context.with(ctx, originalCallback, undefined, err, msg);
            span.setStatus({
              code: SpanStatusCode.OK,
            });
          } catch (err) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err.message,
            });
            span.recordException(err);
            throw err;
          } finally {
            instrumentation.cleanupMessage(msg);
            span.end();
          }
        };
      }
      const sub = originalFunc.apply(this, [subject, opts]);
      if (opts?.callback) {
        // If we have a callback then sub is no longer an async iterator. No
        // need to wrap it. Just bail early
        // https://github.com/nats-io/nats.js#async-vs-callbacks
        return sub;
      }

      const wrappedInterator = (async function* wrappedInterator() {
        for await (let m of sub) {
          m = instrumentation.setupMessage(m, nc);
          // FixMe: What should we do with this ctx when we're in a generator?
          const [_ctx, span] = genSpanAndContextFromMessage(m);

          try {
            yield m;
            span.setStatus({
              code: SpanStatusCode.OK,
            });
          } catch (err) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err.message,
            });
            span.recordException(err);
            throw err;
          } finally {
            instrumentation.cleanupMessage(m);
            span.end();
          }
        }
      })();

      Object.assign(wrappedInterator, sub);
      return wrappedInterator as any;
    };
  }

  private wrapRequest(originalFunc: Nats.NatsConnection['request']) {
    const instrumentation = this;

    return async function request(
      this: Nats.NatsConnection,
      subject: string,
      data?: Uint8Array,
      opts?: Nats.RequestOptions
    ): Promise<Nats.Msg> {
      const nc = this;
      // FixMe: "request" is a non-standard operation. Should we use a diffrent
      // name/format for this span?
      const span = instrumentation.tracer.startSpan(`${subject} request`, {
        attributes: {
          ...utils.baseTraceAttrs(nc.info),
        },
        kind: SpanKind.CLIENT,
      });

      try {
        const res = await context.with(
          trace.setSpan(context.active(), span),
          originalFunc,
          this,
          subject,
          data,
          opts
        );
        span.setStatus({ code: SpanStatusCode.OK });
        return res;
      } catch (err) {
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        throw err;
      } finally {
        span.end();
      }
    };
  }

  private wrapPublish(originalFunc: Nats.NatsConnection['publish']) {
    const instrumentation = this;
    return function publish(
      this: Nats.NatsConnection,
      subject: string,
      data: Uint8Array,
      options?: Nats.PublishOptions
    ): void {
      const nc = this;
      const isTemporaryDestination =
        instrumentation.isTemporaryDestination(subject);
      const destination = isTemporaryDestination ? '(temporary)' : subject;
      const span = instrumentation.tracer.startSpan(`${destination} send`, {
        attributes: {
          ...utils.baseTraceAttrs(nc.info),
          [SemanticAttributes.MESSAGING_DESTINATION_KIND]: 'topic',
          [SemanticAttributes.MESSAGING_DESTINATION]: destination,
          [SemanticAttributes.MESSAGING_TEMP_DESTINATION]:
            isTemporaryDestination,
          [SemanticAttributes.MESSAGING_MESSAGE_PAYLOAD_SIZE_BYTES]: data
            ? data.length
            : 0,
        },
        kind: SpanKind.PRODUCER,
      });
      if (isTemporaryDestination) {
        span.setAttribute(
          SemanticAttributes.MESSAGING_CONVERSATION_ID,
          subject
        );
      } else if (options?.reply) {
        span.setAttribute(
          SemanticAttributes.MESSAGING_CONVERSATION_ID,
          options.reply
        );
      }
      const ctx = trace.setSpan(context.active(), span);
      const h = options?.headers
        ? options.headers
        : instrumentation._natsHelpers.headers!();
      propagation.inject(ctx, h, utils.natsContextSetter);

      try {
        context.with(ctx, originalFunc, this, subject, data, {
          ...options,
          headers: h,
        });
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err) {
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        throw err;
      } finally {
        span.end();
      }
    };
  }

  private wrapRespond(
    originalFunc: Nats.Msg['respond'],
    nc: Nats.NatsConnection
  ) {
    const instrumentation = this;
    return function respond(
      this: Nats.Msg,
      data?: Uint8Array | undefined,
      options?: Nats.PublishOptions | undefined
    ) {
      const msg = this;
      const destination = '(temporary)';
      const span = instrumentation.tracer.startSpan(`${destination} send`, {
        attributes: {
          ...utils.baseTraceAttrs(nc.info),
          [SemanticAttributes.MESSAGING_DESTINATION_KIND]: 'topic',
          [SemanticAttributes.MESSAGING_DESTINATION]: destination,
          [SemanticAttributes.MESSAGING_TEMP_DESTINATION]: true,
          [SemanticAttributes.MESSAGING_MESSAGE_PAYLOAD_SIZE_BYTES]: data
            ? data.length
            : 0,
          [SemanticAttributes.MESSAGING_CONVERSATION_ID]: msg.reply,
        },
        kind: SpanKind.PRODUCER,
      });
      const ctx = trace.setSpan(context.active(), span);
      const h = msg.headers
        ? msg.headers
        : instrumentation._natsHelpers.headers!();
      propagation.inject(ctx, h, utils.natsContextSetter);

      try {
        context.with(ctx, originalFunc, this, data, {
          ...options,
          headers: h,
        });
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err) {
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        throw err;
      } finally {
        span.end();
      }
    };
  }

  private isTemporaryDestination(subject: string) {
    return this._natsHelpers.replySubjects.has(subject);
  }

  private setupMessage(msg: Nats.Msg, nc: Nats.NatsConnection): Nats.Msg {
    const instrumentation = this;
    if (msg.reply) {
      // Add this reply subject to tracked list. When/if we then respond
      // to this reply we will know this is a response rather than
      // publishing to a presisted subject
      this._natsHelpers.replySubjects.add(msg.reply);
    }
    const traps = {
      get: function get(target: Nats.Msg, prop: string) {
        if (prop === 'respond') {
          return instrumentation.wrapRespond(target.respond, nc);
        }
        return (target as any)[prop];
      },
    };

    return new Proxy(msg, traps);
  }

  private cleanupMessage(msg: Nats.Msg) {
    if (msg.reply) {
      // Remove temp reply addresses from memory
      this._natsHelpers.replySubjects.delete(msg.reply);
    }
  }

  ensureWrapped(
    moduleVersion: string | undefined,
    obj: any,
    methodName: string,
    wrapper: (original: any) => any
  ) {
    diag.debug(`Applying ${methodName} patch for nats@${moduleVersion}`);
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(obj, methodName, wrapper);
  }
}
