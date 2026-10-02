/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Structural (duck-typed) mirrors of the shapes exposed by the `ibmmq` npm
 * package (github.com/ibm-messaging/mq-mqi-nodejs). We intentionally do not
 * `import type` from `ibmmq` itself: the real package is a native N-API
 * addon that downloads/links the IBM MQ C client at install time, and this
 * instrumentation must type-check and run without it installed. These
 * interfaces only need to describe the fields we read.
 *
 * Field names and sealing behavior are taken from `lib/mqitypes.js` and
 * `lib/mqod.js` in `ibmmq@2.1.9`.
 */

/** Mirrors `MQQueueManager` (lib/mqitypes.js). `Object.seal`ed by ibmmq. */
export interface MQQueueManagerLike {
  _hConn: unknown;
  _name: string;
}

/** Mirrors `MQObject` (lib/mqitypes.js). `Object.seal`ed by ibmmq. */
export interface MQObjectLike {
  _hObj: unknown;
  _mqQueueManager: MQQueueManagerLike;
  _name: string;
}

/** Mirrors `MQAttr` (lib/mqitypes.js), used for Inq() selectors/results. */
export interface MQAttrLike {
  selector: number;
  value: unknown;
}

/** Mirrors the subset of `MQOD` fields (lib/mqod.js) we read or set. */
export interface MQODLike {
  ObjectName: string | null;
  ObjectType: number;
  ResolvedQName: string | null;
}

/** Mirrors the subset of `MQCNO` (lib/mqcno.js) we read at connect time. */
export interface MQCNOLike {
  ClientConn?: {
    ConnectionName?: string;
    ChannelName?: string;
  } | null;
}

/**
 * Mirrors the subset of `MQGMO` (lib/mqgmo.js) an async `Get` delivery's
 * callback receives. `MsgHandle` is how the delivered message's properties -
 * including a propagated `traceparent`/`tracestate` - are reached via
 * `InqMp`; `MQIMPO_...`-style flags never touch this struct, so `Options` is
 * only here because it is part of the real shape, not because we set it.
 */
export interface MQGMOLike {
  MsgHandle?: bigint;
  Options: number;
}

/**
 * Mirrors the subset of `MQMD` (lib/mqmd.js) an async `Get` delivery's
 * callback receives. `Format` is how a message with no usable message
 * handle is recognized as carrying an inline RFH2 header instead - see
 * `messageParentContext` in utils.ts.
 */
export interface MQMDLike {
  Format: string;
}

/**
 * Mirrors the header struct `MQRFH2.getHeader` (lib/mqstruc.js) returns. We
 * never read any of its fields ourselves; it exists only to hand back
 * unchanged to `MQRFH2.getAllProperties`, which needs it to know where the
 * property folders end in the buffer.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MQRFH2HeaderLike {}

/** Mirrors `MQIMPO` (lib/mqmpo.js): the query-mode flags `InqMp` needs. */
export interface MQIMPOLike {
  Options: number;
}

/**
 * Mirrors `MQPD` (lib/mqmpo.js), the property descriptor `InqMp` requires as
 * an argument. We never read or set any of its fields ourselves, so this
 * interface is intentionally empty - it exists only so `InqMp`'s signature
 * has something to require.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MQPDLike {}

/** Mirrors `MQError` (lib/mqitypes.js): a subclass of Error with mqcc/mqrc. */
export interface MQErrorLike extends Error {
  mqcc: number;
  mqrc: number;
}

export function isMQErrorLike(err: unknown): err is MQErrorLike {
  return (
    !!err &&
    typeof err === 'object' &&
    typeof (err as MQErrorLike).mqrc === 'number'
  );
}

/** What we cache per connection, in the WeakMap keyed on MQQueueManagerLike. */
export interface ConnectionMeta {
  qmid?: string;
  inquiring?: boolean;
}

/**
 * The subset of `ibmmq`'s module exports (lib/mqi.js + lib/mqigeta.js) this
 * instrumentation patches or calls internally (for the QMID inquiry).
 */
export interface IbmMqModuleExports {
  // Every MQC constant this file reads is numeric except the MQFMT_*
  // family (e.g. MQFMT_RF_HEADER_2, compared against MQMD.Format), which
  // are fixed strings in the real object; that one exception is cast at
  // its point of use in utils.ts rather than widening this index type.
  MQC: Record<string, number>;
  MQOD: new () => MQODLike;
  MQAttr: new (selector: number, value?: unknown) => MQAttrLike;
  MQIMPO: new () => MQIMPOLike;
  MQPD: new () => MQPDLike;
  /**
   * Public API (lib/mqi.js: `exports.MQRFH2 = MQSTRUC.MQRFH2;`). Used to
   * parse the inline RFH2 header a message carries when IBM did not give
   * this delivery a message handle - see `messageParentContext` in
   * utils.ts. Never reach into `lib/mqstruc.js` directly; go through this.
   */
  MQRFH2: {
    getHeader: (buf: Buffer) => MQRFH2HeaderLike;
    getAllProperties: (hdr: MQRFH2HeaderLike, buf: Buffer) => string[];
  };

  Conn: (qMgrName: string, cb: MqCallback<MQQueueManagerLike>) => void;
  Connx: (
    qMgrName: string,
    cno: MQCNOLike,
    cb: MqCallback<MQQueueManagerLike>
  ) => void;
  ConnSync: (
    qMgrName: string,
    cb?: MqCallback<MQQueueManagerLike>
  ) => MQQueueManagerLike | undefined;
  ConnxSync: (
    qMgrName: string,
    cno: MQCNOLike,
    cb?: MqCallback<MQQueueManagerLike>
  ) => MQQueueManagerLike | undefined;

  Open: (
    hConn: MQQueueManagerLike,
    jsod: MQODLike,
    options: number,
    cb: MqCallback<MQObjectLike>
  ) => void;
  OpenSync: (
    hConn: MQQueueManagerLike,
    jsod: MQODLike,
    options: number,
    cb?: MqCallback<MQObjectLike>
  ) => MQObjectLike | undefined;
  CloseSync: (
    hObj: MQObjectLike,
    options: number,
    cb?: MqCallback<void>
  ) => void;
  Inq: (
    hObj: MQObjectLike,
    selectors: MQAttrLike[],
    cb: (err: MQErrorLike | null | undefined, selectors: MQAttrLike[]) => void
  ) => void;
  /**
   * Inquires one named message property off a `MsgHandle`. Called from the
   * async `Get` delivery callback to read `traceparent`/`tracestate`
   * ourselves - see `messageParentContext` in utils.ts for why. Documented
   * (and measured) as synchronous: the native call runs and `cb` fires
   * before `InqMp` returns, which is required here since it is called from
   * inside `ibmmq`'s own delivery callback, where a deferred read would hit
   * MQRC_HCONN_ASYNC_ACTIVE.
   */
  InqMp: (
    hConn: MQQueueManagerLike,
    hMsg: bigint,
    impo: MQIMPOLike,
    pd: MQPDLike,
    name: string,
    valueBuffer: Buffer,
    cb: (
      err: MQErrorLike | null | undefined,
      returnedName?: string,
      value?: unknown,
      propsLen?: number,
      type?: number
    ) => void
  ) => void;

  Put: (...args: unknown[]) => void;
  PutSync: (...args: unknown[]) => void;
  Put1: (...args: unknown[]) => void;
  Put1Sync: (...args: unknown[]) => void;
  GetSync: (...args: unknown[]) => void;
  Get: (...args: unknown[]) => void;
  Ctl: (...args: unknown[]) => void;
}

export type MqCallback<T> = (
  err: MQErrorLike | null | undefined,
  result?: T
) => void;
