/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Span, SpanKind, SpanStatusCode, context, trace } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import {
  IbmMqModuleExports,
  MQObjectLike,
  MQODLike,
  MQQueueManagerLike,
  MqCallback,
} from './internal-types';
import {
  ATTR_MESSAGING_DESTINATION_NAME,
  MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
  MESSAGING_OPERATION_TYPE_VALUE_RECEIVE,
  MESSAGING_OPERATION_TYPE_VALUE_SEND,
} from './semconv';
import { DEFAULT_CONFIG, IbmMqInstrumentationConfig } from './types';
import {
  buildMessagingAttributes,
  destinationFromOD,
  destinationFromObject,
  ensureQueueManagerId,
  invalidateOnReconnect,
  isRoutineNoMessage,
  recordResolvedName,
  resolveConnectionOnConnect,
} from './utils';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

const supportedVersions = ['>=2.0.0 <3'];

export class IbmMqInstrumentation extends InstrumentationBase<IbmMqInstrumentationConfig> {
  constructor(config: IbmMqInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, { ...DEFAULT_CONFIG, ...config });
  }

  override setConfig(config: IbmMqInstrumentationConfig = {}) {
    super.setConfig({ ...DEFAULT_CONFIG, ...config });
  }

  protected init() {
    const module = new InstrumentationNodeModuleDefinition(
      'ibmmq',
      supportedVersions,
      this.patch.bind(this),
      this.unpatch.bind(this)
    );
    return module;
  }

  private patch(module: any) {
    // `ibmmq` is CommonJS-only; under `--import`/ESM the loader hands us a
    // namespace object instead of the raw exports.
    const moduleExports: IbmMqModuleExports =
      module[Symbol.toStringTag] === 'Module' ? module.default : module;
    // `_wrap`'s generic signature demands the wrapper match the exact
    // per-property type; our patch factories are written generically
    // against `(...args: unknown[]) => unknown` instead (as amqplib and
    // other free-function patches in this repo do), so wrap through an
    // untyped view of the same object.
    const anyExports: any = moduleExports;

    if (!isWrapped(anyExports.Conn)) {
      this._wrap(
        anyExports,
        'Conn',
        this.getConnectPatch.bind(this, moduleExports)
      );
    }
    if (!isWrapped(anyExports.Connx)) {
      this._wrap(
        anyExports,
        'Connx',
        this.getConnectPatch.bind(this, moduleExports)
      );
    }
    if (!isWrapped(anyExports.ConnSync)) {
      this._wrap(
        anyExports,
        'ConnSync',
        this.getConnectPatch.bind(this, moduleExports)
      );
    }
    if (!isWrapped(anyExports.ConnxSync)) {
      this._wrap(
        anyExports,
        'ConnxSync',
        this.getConnectPatch.bind(this, moduleExports)
      );
    }

    if (!isWrapped(anyExports.Open)) {
      this._wrap(anyExports, 'Open', this.getOpenPatch.bind(this));
    }
    if (!isWrapped(anyExports.OpenSync)) {
      this._wrap(anyExports, 'OpenSync', this.getOpenPatch.bind(this));
    }

    if (!isWrapped(anyExports.Put)) {
      this._wrap(
        anyExports,
        'Put',
        this.getObjectOperationPatch.bind(this, moduleExports, 'send')
      );
    }
    if (!isWrapped(anyExports.PutSync)) {
      this._wrap(
        anyExports,
        'PutSync',
        this.getObjectOperationPatch.bind(this, moduleExports, 'send')
      );
    }
    if (!isWrapped(anyExports.GetSync)) {
      this._wrap(
        anyExports,
        'GetSync',
        this.getObjectOperationPatch.bind(this, moduleExports, 'receive')
      );
    }

    if (!isWrapped(anyExports.Put1)) {
      this._wrap(
        anyExports,
        'Put1',
        this.getQueueManagerOperationPatch.bind(this, moduleExports)
      );
    }
    if (!isWrapped(anyExports.Put1Sync)) {
      this._wrap(
        anyExports,
        'Put1Sync',
        this.getQueueManagerOperationPatch.bind(this, moduleExports)
      );
    }

    if (!isWrapped(anyExports.Get)) {
      this._wrap(
        anyExports,
        'Get',
        this.getGetPatch.bind(this, moduleExports)
      );
    }
    if (!isWrapped(anyExports.Ctl)) {
      this._wrap(anyExports, 'Ctl', this.getCtlPatch.bind(this));
    }

    return module;
  }

  private unpatch(module: any) {
    const anyExports: any =
      module[Symbol.toStringTag] === 'Module' ? module.default : module;

    for (const name of [
      'Conn',
      'Connx',
      'ConnSync',
      'ConnxSync',
      'Open',
      'OpenSync',
      'Put',
      'PutSync',
      'GetSync',
      'Put1',
      'Put1Sync',
      'Get',
      'Ctl',
    ] as const) {
      if (isWrapped(anyExports[name])) {
        this._unwrap(anyExports, name);
      }
    }
  }

  /**
   * `Conn`/`Connx` (callback required) and `ConnSync`/`ConnxSync` (callback
   * optional, else throw-or-return) all hand the app's freshly-authenticated
   * `MQQueueManager` back on success. No span - this patch point only caches
   * the queue manager name and, if enabled, kicks off the one QMID inquiry
   * for this connection's lifetime.
   */
  private getConnectPatch(
    moduleExports: IbmMqModuleExports,
    original: (...args: unknown[]) => unknown
  ) {
    const self = this;
    return function patchedConnect(this: unknown, ...args: unknown[]) {
      const lastIndex = args.length - 1;
      const maybeCb = args[lastIndex];

      const onConnected = (hConn: MQQueueManagerLike | undefined) => {
        const config = self.getConfig();
        resolveConnectionOnConnect(
          moduleExports,
          hConn,
          config.emitQueueManagerId
        );
      };

      if (typeof maybeCb === 'function') {
        const originalCb = maybeCb as MqCallback<MQQueueManagerLike>;
        const boundCb = context.bind(
          context.active(),
          (err: unknown, hConn?: MQQueueManagerLike) => {
            if (!err) onConnected(hConn);
            return (originalCb as (...a: unknown[]) => unknown)(err, hConn);
          }
        );
        const newArgs = args.slice(0, lastIndex);
        newArgs.push(boundCb);
        return original.apply(this, newArgs);
      }

      // Sync variant, no callback: throws on error, else returns hConn.
      const hConn = original.apply(this, args) as MQQueueManagerLike | undefined;
      onConnected(hConn);
      return hConn;
    };
  }

  /**
   * `Open` (callback required) and `OpenSync` (callback optional, else
   * throw-or-return) create no span - bookkeeping only. MQ mutates the
   * caller's `MQOD` in place with the resolved queue (and queue manager)
   * name, which can differ from the requested name for an alias, clustered,
   * or dynamic reply queue. That resolution never changes for the lifetime
   * of the returned `MQObject`, so it is captured once here, in a WeakMap
   * keyed on that object, and consulted at Put/Get time by
   * `destinationFromObject` instead of the requested `_name`.
   */
  private getOpenPatch(original: (...args: unknown[]) => unknown) {
    return function patchedOpen(this: unknown, ...args: unknown[]) {
      const jsod = args[1] as MQODLike;
      const lastIndex = args.length - 1;
      const maybeCb = args[lastIndex];

      if (typeof maybeCb === 'function') {
        const originalCb = maybeCb as MqCallback<MQObjectLike>;
        const boundCb = context.bind(
          context.active(),
          (err: unknown, hObj?: MQObjectLike) => {
            if (!err) recordResolvedName(hObj, jsod);
            return (originalCb as (...a: unknown[]) => unknown)(err, hObj);
          }
        );
        const newArgs = args.slice(0, lastIndex);
        newArgs.push(boundCb);
        return original.apply(this, newArgs);
      }

      // Sync variant, no callback: throws on error, else returns hObj.
      const hObj = original.apply(this, args) as MQObjectLike | undefined;
      recordResolvedName(hObj, jsod);
      return hObj;
    };
  }

  /**
   * Shared by `Put`/`PutSync` (producer, `send`) and `GetSync` (one-shot
   * consumer, `receive`). All three take an already-opened `MQObject` as
   * their first argument, from which both the destination name and the
   * owning connection are reachable.
   */
  private getObjectOperationPatch(
    moduleExports: IbmMqModuleExports,
    operationName: 'send' | 'receive',
    original: (...args: unknown[]) => unknown
  ) {
    const self = this;
    const operationType =
      operationName === 'send'
        ? MESSAGING_OPERATION_TYPE_VALUE_SEND
        : MESSAGING_OPERATION_TYPE_VALUE_RECEIVE;
    const spanKind =
      operationName === 'send' ? SpanKind.PRODUCER : SpanKind.CLIENT;

    return function patchedOperation(this: unknown, ...args: unknown[]) {
      const jsObject = args[0] as MQObjectLike;
      const hConn = jsObject?._mqQueueManager;
      const config = self.getConfig();
      const destination = destinationFromObject(jsObject);
      const qmid = ensureQueueManagerId(
        moduleExports,
        hConn,
        config.emitQueueManagerId
      );

      const span = self.tracer.startSpan(`${operationName} ${destination}`, {
        kind: spanKind,
        attributes: buildMessagingAttributes(
          destination,
          operationType,
          operationName,
          qmid
        ),
      });

      return context.with(trace.setSpan(context.active(), span), () =>
        self.callAndEndSpan(span, hConn, original, this, args)
      );
    };
  }

  /**
   * `Put1`/`Put1Sync` (producer, `send`) take the queue manager and the
   * `MQOD` that describes the destination directly, with no `MQObject`.
   * Unlike `Open`, MQ only writes `ResolvedQName` onto the `MQOD` as a side
   * effect of the Put1 call itself completing - reading it before `original`
   * has run always sees the pre-call value, so the span is opened on the
   * requested name and corrected to the resolved one once the call settles
   * (callback fired, or synchronous return/throw), via `callAndEndSpan`'s
   * `onSettled` hook.
   */
  private getQueueManagerOperationPatch(
    moduleExports: IbmMqModuleExports,
    original: (...args: unknown[]) => unknown
  ) {
    const self = this;
    return function patchedPut1(this: unknown, ...args: unknown[]) {
      const hConn = args[0] as MQQueueManagerLike;
      const jsod = args[1] as MQODLike;
      const config = self.getConfig();
      const requested = jsod.ObjectName || '<<unknown>>';
      const qmid = ensureQueueManagerId(
        moduleExports,
        hConn,
        config.emitQueueManagerId
      );

      const span = self.tracer.startSpan(`send ${requested}`, {
        kind: SpanKind.PRODUCER,
        attributes: buildMessagingAttributes(
          requested,
          MESSAGING_OPERATION_TYPE_VALUE_SEND,
          'send',
          qmid
        ),
      });

      const resolveDestination = () => {
        const resolved = destinationFromOD(jsod);
        if (resolved !== requested) {
          span.updateName(`send ${resolved}`);
          span.setAttribute(ATTR_MESSAGING_DESTINATION_NAME, resolved);
        }
      };

      return context.with(trace.setSpan(context.active(), span), () =>
        self.callAndEndSpan(span, hConn, original, this, args, resolveDestination)
      );
    };
  }

  /**
   * `Get` registers a persistent listener rather than performing a one-shot
   * get; delivery only starts once `Ctl(hConn, MQOP_START)` is called (see
   * `getCtlPatch`), and the same callback is invoked once per arriving
   * message - or per failed/timed-out get attempt - for as long as the
   * listener stays registered. So, unlike every other patch point, one
   * `Get()` call produces many spans, each ended before its own callback
   * invocation returns. MQRC_NO_MSG_AVAILABLE (2033) arrives here on a wait
   * timeout exactly as it does on `GetSync`; `endSpan`/`markError` is the
   * shared choke point that leaves that one UNSET instead of ERROR.
   */
  private getGetPatch(
    moduleExports: IbmMqModuleExports,
    original: (...args: unknown[]) => unknown
  ) {
    const self = this;
    return function patchedGet(this: unknown, ...args: unknown[]) {
      const jsObject = args[0] as MQObjectLike;
      const lastIndex = args.length - 1;
      const originalCb = args[lastIndex] as MqCallback<unknown>;

      const wrappedCb = context.bind(
        context.active(),
        (err: unknown, hObj: MQObjectLike, ...rest: unknown[]) => {
          const config = self.getConfig();
          const destination = destinationFromObject(hObj ?? jsObject);
          const hConn = (hObj ?? jsObject)?._mqQueueManager;
          const qmid = ensureQueueManagerId(
            moduleExports,
            hConn,
            config.emitQueueManagerId
          );

          const span = self.tracer.startSpan(`process ${destination}`, {
            kind: SpanKind.CONSUMER,
            attributes: buildMessagingAttributes(
              destination,
              MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
              'process',
              qmid
            ),
          });

          if (err) {
            self.endSpan(span, hConn, err);
            return (originalCb as (...a: unknown[]) => unknown)(
              err,
              hObj,
              ...rest
            );
          }

          return context.with(trace.setSpan(context.active(), span), () => {
            try {
              return (originalCb as (...a: unknown[]) => unknown)(
                err,
                hObj,
                ...rest
              );
            } catch (cbErr) {
              self.markError(span, hConn, cbErr);
              throw cbErr;
            } finally {
              span.end();
            }
          });
        }
      );

      const newArgs = args.slice(0, lastIndex);
      newArgs.push(wrappedCb);
      return original.apply(this, newArgs);
    };
  }

  /**
   * `Ctl` is the delivery trigger for the async `Get` listener
   * (`MQOP_START`/`MQOP_STOP`/...), not a message operation itself - no
   * span, only context propagation for its (optional) callback.
   */
  private getCtlPatch(original: (...args: unknown[]) => unknown) {
    return function patchedCtl(this: unknown, ...args: unknown[]) {
      const lastIndex = args.length - 1;
      const maybeCb = args[lastIndex];
      if (typeof maybeCb === 'function') {
        const boundCb = context.bind(context.active(), maybeCb);
        const newArgs = args.slice(0, lastIndex);
        newArgs.push(boundCb);
        return original.apply(this, newArgs);
      }
      return original.apply(this, args);
    };
  }

  /**
   * Sets error status and, on a reconnect-shaped error, drops the QMID
   * cache entry. Does not end the span. Skips the status (and records no
   * exception) for MQRC_NO_MSG_AVAILABLE - a timed-out get against an idle
   * queue is routine, not a failure; every other error still ends up ERROR.
   */
  private markError(
    span: Span,
    hConn: MQQueueManagerLike | undefined,
    err: unknown
  ): void {
    invalidateOnReconnect(hConn, err);
    if (err && !isRoutineNoMessage(err)) {
      const message = err instanceof Error ? err.message : String(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message });
    }
  }

  private endSpan(
    span: Span,
    hConn: MQQueueManagerLike | undefined,
    err: unknown
  ): void {
    this.markError(span, hConn, err);
    span.end();
  }

  /**
   * Shared tail for `Put`/`PutSync`/`Put1`/`Put1Sync`/`GetSync`: they all take
   * a variable-length argument list ending *optionally* (Sync variants) in an
   * `(err, ...) => void` callback. If one was supplied, bind it to the calling
   * context (a native addon calling back into JS may lose the active context,
   * see the session handoff section 7) and end the span from inside it. If
   * none was supplied, the verb is being used in its throw-or-return-directly
   * form, so end the span synchronously around the call instead.
   *
   * `onSettled`, if given, runs once the real call has settled (success or
   * error) but strictly before the span ends - the one hook `Put1`/`Put1Sync`
   * need to re-read their `MQOD` for `ResolvedQName` only after MQ has
   * actually written it.
   */
  private callAndEndSpan(
    span: Span,
    hConn: MQQueueManagerLike | undefined,
    original: (...args: unknown[]) => unknown,
    thisArg: unknown,
    args: unknown[],
    onSettled?: () => void
  ): unknown {
    const lastIndex = args.length - 1;
    const maybeCb = args[lastIndex];
    const self = this;

    if (typeof maybeCb === 'function') {
      const originalCb = maybeCb as MqCallback<unknown>;
      const boundCb = context.bind(
        context.active(),
        (err: unknown, ...rest: unknown[]) => {
          onSettled?.();
          self.endSpan(span, hConn, err);
          return (originalCb as (...a: unknown[]) => unknown)(err, ...rest);
        }
      );
      const newArgs = args.slice(0, lastIndex);
      newArgs.push(boundCb);
      return original.apply(thisArg, newArgs);
    }

    try {
      const result = original.apply(thisArg, args);
      onSettled?.();
      this.endSpan(span, hConn, undefined);
      return result;
    } catch (err) {
      onSettled?.();
      this.endSpan(span, hConn, err);
      throw err;
    }
  }
}
