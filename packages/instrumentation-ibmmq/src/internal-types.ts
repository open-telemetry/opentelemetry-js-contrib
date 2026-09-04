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
  MQC: Record<string, number>;
  MQOD: new () => MQODLike;
  MQAttr: new (selector: number, value?: unknown) => MQAttrLike;

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
