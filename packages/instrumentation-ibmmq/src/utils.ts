/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Attributes, Context, ROOT_CONTEXT, propagation } from '@opentelemetry/api';
import {
  ConnectionMeta,
  IbmMqModuleExports,
  MQGMOLike,
  MQMDLike,
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

/**
 * IBM's own `mqiotel.js` hook (`getTraceAfter`) runs inside `mqigeta.js`'s
 * `preJsAppCB`, one statement before our wrapped `Get` callback is invoked -
 * so by the time our `process` span exists, whatever link that hook tried to
 * add has already been discarded; there was no span yet to add it to. The
 * functions below read the same two message properties ourselves and turn
 * them into a parent context for the `process` span instead of a link.
 *
 * IBM's hook carries `traceparent`/`tracestate` in one of two places, and
 * which one is used is decided entirely by how the application asked for
 * its message, not by us. Per `mqiotel.js`'s `getTraceBefore`, IBM only
 * creates a message handle for this delivery (and sets
 * `MQGMO_PROPERTIES_IN_HANDLE`) when the application asked for
 * `MQGMO_NO_PROPERTIES`, or asked for `MQGMO_PROPERTIES_AS_Q_DEF` while the
 * queue's PROPCTL is `MQPROP_NONE`. Every other combination - which is the
 * common default - leaves `gmo.MsgHandle` unset, and the properties arrive
 * instead as an inline RFH2 header in the message body. So both carriers
 * have to be tried: the message handle, via `InqMp`, and the RFH2 header,
 * parsed by hand.
 */
const TRACEPARENT_PROPERTY = 'traceparent';
const TRACESTATE_PROPERTY = 'tracestate';

/**
 * `InqMp` writes the raw property value into whatever buffer it is given.
 * Allocating a fresh buffer per lookup would add an allocation on the
 * message-delivery hot path for a value that is always short - a traceparent
 * is a fixed 55 characters, and a tracestate is rarely long either. IBM's own
 * `mqiotel.js` reuses a single 10240-byte buffer across every property
 * lookup for the same reason; 1024 is ample here since only these two
 * properties are ever read. `InqMp` is fully synchronous (the native call
 * runs and its callback fires before `InqMp` itself returns), so this buffer
 * is never in use by two lookups at once.
 */
const propertyValueBuffer = Buffer.alloc(1024);

/**
 * One `InqMp` lookup for a single named message property, trimmed. A missing
 * property (MQRC_PROPERTY_NOT_AVAILABLE) is the normal case - most messages
 * carry no propagated context at all, and a message can carry a traceparent
 * without a tracestate - so every error here is swallowed; the caller only
 * ever sees `undefined`, never an exception.
 */
function inqMessageProperty(
  mq: IbmMqModuleExports,
  hConn: MQQueueManagerLike,
  msgHandle: bigint,
  name: string
): string | undefined {
  let value: string | undefined;
  try {
    const impo = new mq.MQIMPO();
    impo.Options = mq.MQC.MQIMPO_CONVERT_VALUE | mq.MQC.MQIMPO_INQ_FIRST;
    const pd = new mq.MQPD();
    mq.InqMp(
      hConn,
      msgHandle,
      impo,
      pd,
      name,
      propertyValueBuffer,
      (err, _returnedName, propValue) => {
        if (!err && typeof propValue === 'string') {
          value = propValue.trim();
        }
      }
    );
  } catch {
    // A malformed handle or an unexpected native-layer throw must never
    // surface to the application; the property is simply treated as absent.
  }
  return value;
}

/** MQHM_NONE / MQHM_UNUSABLE_HMSG: no message properties can be read. */
function isValidMsgHandle(
  mq: IbmMqModuleExports,
  msgHandle: bigint | undefined
): msgHandle is bigint {
  if (msgHandle === undefined) return false;
  return (
    msgHandle !== BigInt(mq.MQC.MQHM_NONE) &&
    msgHandle !== BigInt(mq.MQC.MQHM_UNUSABLE_HMSG)
  );
}

/**
 * Pulls one named property's value out of an RFH2 "namevalue" folder string,
 * without a full XML parse. A folder looks like
 * `<usr><traceparent>00-...-01</traceparent></usr>`; a simple string search
 * for the opening and closing tags is exact rather than approximate here
 * because RFH2 property values come from a restricted character set that
 * never includes `<`, so the first `<` after the opening tag is always the
 * start of the next tag, never part of the value itself. IBM's own
 * `mqiotel.js` (`extractRFH2PropVal`) relies on the same restriction.
 */
function extractRfh2PropertyValue(
  properties: string[],
  name: string
): string | undefined {
  const openTag = `<${name}>`;
  for (const folder of properties) {
    const start = folder.indexOf(openTag);
    if (start === -1) continue;
    const valueStart = start + openTag.length;
    const end = folder.indexOf('<', valueStart);
    if (end === -1) continue;
    return folder.substring(valueStart, end);
  }
  return undefined;
}

/**
 * Falls back to an inline RFH2 header for a single named message property,
 * for the common case where IBM gave this delivery no message handle at
 * all - see the doc comment above `TRACEPARENT_PROPERTY`. `mq.MQRFH2` is
 * IBM's own public parser (`lib/mqi.js` re-exports it from `lib/mqstruc.js`),
 * never reimplemented here. Every failure mode - no MD, no buffer, a format
 * other than `MQFMT_RF_HEADER_2`, or a malformed header that throws inside
 * `getHeader`/`getAllProperties` - returns `undefined` rather than
 * surfacing to the application; a delivery callback is not the place for a
 * parse error to escape from.
 */
function rfh2Property(
  mq: IbmMqModuleExports,
  md: MQMDLike | undefined,
  buf: Buffer | undefined,
  name: string
): string | undefined {
  // MQC's index type is numeric (see IbmMqModuleExports.MQC) since every
  // other constant read from it in this file is; the MQFMT_* family is the
  // one exception, and is a fixed string in the real object.
  const rfh2Format = mq.MQC.MQFMT_RF_HEADER_2 as unknown as string;
  if (!md || !buf || md.Format !== rfh2Format) {
    return undefined;
  }
  try {
    const header = mq.MQRFH2.getHeader(buf);
    const properties = mq.MQRFH2.getAllProperties(header, buf);
    return extractRfh2PropertyValue(properties, name);
  } catch {
    return undefined;
  }
}

/**
 * Resolves one named propagation property for a delivery, trying the
 * message handle first (the cheaper, already-parsed lookup) and falling
 * back to the inline RFH2 header. Only one of the two carriers is ever
 * actually populated for a given delivery - see the doc comment above
 * `TRACEPARENT_PROPERTY` - so trying both in sequence costs nothing extra
 * in the common case.
 */
function resolveMessageProperty(
  mq: IbmMqModuleExports,
  hConn: MQQueueManagerLike | undefined,
  gmo: MQGMOLike | undefined,
  md: MQMDLike | undefined,
  buf: Buffer | undefined,
  name: string
): string | undefined {
  const msgHandle = gmo?.MsgHandle;
  if (hConn && isValidMsgHandle(mq, msgHandle)) {
    const value = inqMessageProperty(mq, hConn, msgHandle, name);
    if (value) return value;
  }
  return rfh2Property(mq, md, buf, name);
}

/**
 * Builds the parent context for an async `Get` delivery's `process` span,
 * from whichever of the two carriers described above `TRACEPARENT_PROPERTY`
 * actually holds this message's properties. Returns `ROOT_CONTEXT` whenever
 * there is nothing to extract: no connection, no usable carrier, or no
 * `traceparent` in whichever carrier was present.
 *
 * `ROOT_CONTEXT` here is deliberate, not `context.active()`. Inheriting
 * whatever context happens to be ambient when the listener fires is exactly
 * what produced the unbounded receive-span chain fixed alongside this (see
 * `callAndEndSpan`'s `callerContext` parameter) - a message with no inbound
 * trace context has no parent, and must not silently inherit one.
 */
export function messageParentContext(
  mq: IbmMqModuleExports,
  hConn: MQQueueManagerLike | undefined,
  gmo: MQGMOLike | undefined,
  md: MQMDLike | undefined,
  buf: Buffer | undefined
): Context {
  const traceparentValue = resolveMessageProperty(
    mq,
    hConn,
    gmo,
    md,
    buf,
    TRACEPARENT_PROPERTY
  );
  if (!traceparentValue) return ROOT_CONTEXT;

  const carrier: Record<string, string> = { traceparent: traceparentValue };
  const tracestateValue = resolveMessageProperty(
    mq,
    hConn,
    gmo,
    md,
    buf,
    TRACESTATE_PROPERTY
  );
  if (tracestateValue) carrier.tracestate = tracestateValue;

  return propagation.extract(ROOT_CONTEXT, carrier);
}
