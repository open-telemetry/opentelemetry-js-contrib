/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Attributes } from '@opentelemetry/api';
import {
  ConnectionMeta,
  IbmMqModuleExports,
  MQObjectLike,
  MQODLike,
  MQQueueManagerLike,
  isMQErrorLike,
} from './internal-types';
import {
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_IBMMQ_QUEUE_MANAGER_ID,
  ATTR_MESSAGING_OPERATION_NAME,
  ATTR_MESSAGING_OPERATION_TYPE,
  ATTR_MESSAGING_SYSTEM,
  MESSAGING_SYSTEM_VALUE_IBMMQ,
} from './semconv';

/**
 * Per-connection cache: MQQueueManager -> { queue manager name, QMID, ... }.
 * Forced by `Object.seal()` on MQQueueManager (see internal-types.ts) and
 * correct by construction: entries vanish once the app drops the
 * connection, no cleanup code needed. Precedent:
 * `instrumentation-kafkajs`'s `_clusterWeakMap`.
 */
export const connectionMetaMap = new WeakMap<
  MQQueueManagerLike,
  ConnectionMeta
>();

/** MQRC_RECONNECTED / MQRC_CONNECTION_BROKEN. */
const RECONNECT_MQRCS = new Set([2545, 2009]);

export function isReconnectError(err: unknown): boolean {
  return isMQErrorLike(err) && RECONNECT_MQRCS.has(err.mqrc);
}

/**
 * MQRC_NO_MSG_AVAILABLE: the routine outcome of a timed-out get against an
 * idle queue, not a failure - every polling consumer hits this constantly.
 * Marking it ERROR would show as a ~100% error rate for an idle consumer.
 */
const MQRC_NO_MSG_AVAILABLE = 2033;

export function isRoutineNoMessage(err: unknown): boolean {
  return isMQErrorLike(err) && err.mqrc === MQRC_NO_MSG_AVAILABLE;
}

/**
 * ponytail: invalidating the cache on 2545/2009 is unverified against a real
 * multi-instance queue manager (none in the lab this was built against) - it
 * only proves out on the next `ensureQueueManagerId` re-inquiry. Upgrade path
 * if it's ever wrong: a broker-side reproduction of an automatic client
 * reconnect landing on a different queue manager.
 */
export function invalidateOnReconnect(
  hConn: MQQueueManagerLike | undefined,
  err: unknown
): void {
  if (hConn && isReconnectError(err)) {
    connectionMetaMap.delete(hConn);
  }
}

/**
 * One MQINQ round trip (OpenSync MQOT_Q_MGR -> Inq MQCA_Q_MGR_IDENTIFIER ->
 * CloseSync), proven at 1.5-2.2ms against a live broker. Never call this per
 * message - see the session handoff, section 21.6. Errors (including
 * MQRC_NOT_AUTHORIZED) are swallowed: the caller gets `undefined` and the
 * attribute is simply omitted, matching the "graceful degradation" contract.
 */
export function inquireQueueManagerId(
  mq: IbmMqModuleExports,
  hConn: MQQueueManagerLike,
  cb: (qmid: string | undefined) => void
): void {
  // This whole chain must complete in the caller's tick, so that the qmid is
  // cached before the application's connect callback runs its first operation.
  // `OpenSync`/`CloseSync` pass `async = false` unconditionally in lib/mqi.js,
  // so neither depends on `hConn._inCB` being set; `Inq` is always synchronous
  // (a direct blocking native call). `Close` is the one asynchronous verb here,
  // and its completion has no bearing on the value, so the qmid is delivered
  // before the handle is closed rather than from the close callback.
  try {
    const od: MQODLike = new mq.MQOD();
    od.ObjectName = null; // MUST be null for MQOT_Q_MGR (else MQRC_NAME_NOT_VALID_FOR_TYPE)
    od.ObjectType = mq.MQC.MQOT_Q_MGR;

    mq.OpenSync(hConn, od, mq.MQC.MQOO_INQUIRE, (openErr, hObj) => {
      if (openErr || !hObj) {
        cb(undefined);
        return;
      }
      let qmid: string | undefined;
      try {
        mq.Inq(hObj, [new mq.MQAttr(mq.MQC.MQCA_Q_MGR_IDENTIFIER)], (inqErr, sel) => {
          const value = sel?.[0]?.value;
          qmid = !inqErr && typeof value === 'string' ? value.trim() : undefined;
        });
      } catch {
        // Leave qmid undefined; the span simply omits the attribute.
      }
      cb(qmid);
      try {
        mq.CloseSync(hObj, 0, () => {
          /* cleanup only, nothing waits on it */
        });
      } catch {
        // A failed close must not surface to the application.
      }
    });
  } catch {
    // Never let a QMID-inquiry failure surface to the application.
    cb(undefined);
  }
}

/**
 * Records what we know about a freshly-opened connection, and - if enabled -
 * kicks off the one-per-connection background QMID inquiry. Called
 * synchronously from inside the app's own Conn/Connx/ConnSync/ConnxSync
 * callback; never blocks it.
 */
export function resolveConnectionOnConnect(
  mq: IbmMqModuleExports,
  hConn: MQQueueManagerLike | undefined,
  emitQueueManagerId: boolean | undefined
): void {
  if (!hConn) return;

  connectionMetaMap.set(hConn, {});

  if (emitQueueManagerId) {
    fireQueueManagerIdInquiry(mq, hConn);
  }
}

function fireQueueManagerIdInquiry(
  mq: IbmMqModuleExports,
  hConn: MQQueueManagerLike
): void {
  const meta = connectionMetaMap.get(hConn);
  if (!meta || meta.inquiring) return;
  meta.inquiring = true;
  inquireQueueManagerId(mq, hConn, qmid => {
    const current = connectionMetaMap.get(hConn);
    if (current) {
      current.qmid = qmid;
      current.inquiring = false;
    }
  });
}

/**
 * Called from every send/receive/process patch site, before building span
 * attributes. Returns the QMID if it is already cached; otherwise, if
 * enabled, starts (or lets an in-flight) background inquiry run and returns
 * `undefined` for *this* operation's span - the next operation on the same
 * connection will find it cached. Handles both a never-seen connection
 * (e.g. app required `ibmmq` before the hook installed) and a WeakMap entry
 * invalidated by `invalidateOnReconnect`.
 */
export function ensureQueueManagerId(
  mq: IbmMqModuleExports,
  hConn: MQQueueManagerLike | undefined,
  emitQueueManagerId: boolean | undefined
): string | undefined {
  if (!hConn || !emitQueueManagerId) return undefined;

  let meta = connectionMetaMap.get(hConn);
  if (!meta) {
    meta = {};
    connectionMetaMap.set(hConn, meta);
  }
  if (meta.qmid === undefined) {
    fireQueueManagerIdInquiry(mq, hConn);
    return undefined;
  }
  return meta.qmid;
}

/** Prefer `MQOD.ResolvedQName` (set by MQ after Open) over the requested name. */
export function destinationFromOD(od: MQODLike): string {
  return od.ResolvedQName || od.ObjectName || '<<unknown>>';
}

/**
 * Per-object cache: MQObject -> the queue name MQ resolved at Open time.
 * `Put`/`PutSync`/`GetSync`/`Get` only ever hand us an already-opened
 * `MQObject`, never the `MQOD` that opened it - and for an alias, clustered,
 * or dynamic reply queue, `MQOD.ResolvedQName` (set by MQ, in place, on the
 * caller's own MQOD during Open) differs from the name the app requested.
 * Populated by the `Open`/`OpenSync` patch; forced by `Object.seal()` on
 * MQObject (see internal-types.ts), same rationale as `connectionMetaMap`.
 */
export const resolvedNameMap = new WeakMap<MQObjectLike, string>();

/** Called from the Open/OpenSync patch once MQ has resolved `od` in place. */
export function recordResolvedName(
  hObj: MQObjectLike | undefined,
  od: MQODLike
): void {
  if (!hObj) return;
  const resolvedQName = od.ResolvedQName?.trim();
  if (!resolvedQName) return;
  resolvedNameMap.set(hObj, resolvedQName);
}

/**
 * Prefers the `ResolvedQName` captured at Open time over `_name` (the
 * requested name) - see `resolvedNameMap`. Falls back to `_name` for an
 * MQObject that was never opened through our patch (e.g. built by test code)
 * or whose resolved name came back empty.
 */
export function destinationFromObject(obj: MQObjectLike): string {
  return resolvedNameMap.get(obj) || obj?._name || '<<unknown>>';
}

export function buildMessagingAttributes(
  destination: string,
  operationType: string,
  operationName: string,
  qmid: string | undefined
): Attributes {
  const attributes: Attributes = {
    [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_IBMMQ,
    [ATTR_MESSAGING_DESTINATION_NAME]: destination,
    [ATTR_MESSAGING_OPERATION_TYPE]: operationType,
    [ATTR_MESSAGING_OPERATION_NAME]: operationName,
  };
  if (qmid !== undefined) {
    attributes[ATTR_MESSAGING_IBMMQ_QUEUE_MANAGER_ID] = qmid;
  }
  return attributes;
}
