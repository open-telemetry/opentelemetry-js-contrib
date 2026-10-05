/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { SpanKind, SpanStatusCode, context, trace } from '@opentelemetry/api';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';
import { IbmMqInstrumentation } from '../src';
import { connectionMetaMap, invalidateOnReconnect } from '../src/utils';
import {
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_IBMMQ_QUEUE_MANAGER_ID,
  ATTR_MESSAGING_OPERATION_NAME,
  ATTR_MESSAGING_SYSTEM,
  MESSAGING_SYSTEM_VALUE_IBMMQ,
} from '../src/semconv';
import { MQErrorLike } from '../src/internal-types';

const instrumentation = registerInstrumentationTesting(
  new IbmMqInstrumentation()
);

// The 48-byte space-padded field a real `MQINQ` returns; `inquireQueueManagerId`
// must trim it (session handoff section 21).
const FAKE_QMID = 'TESTQM_2026-08-31_09.07.16';
const FAKE_QMID_PADDED = FAKE_QMID.padEnd(48, ' ');

/**
 * Builds an RFH2 message body out of one or more "namevalue" folder
 * strings, in the same length-prefixed layout the fake `MQRFH2` above (and
 * the real `lib/mqstruc.js`) expects to walk. Standing in for a message
 * IBM's client formatted with `<usr><traceparent>...</traceparent></usr>`
 * inline in the body, because no message handle was created for it.
 */
function encodeRfh2Folders(folders: string[]): Buffer {
  const parts: Buffer[] = [];
  for (const folder of folders) {
    const body = Buffer.from(folder, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(body.length, 0);
    parts.push(len, body);
  }
  return Buffer.concat(parts);
}

/**
 * A hand-built stand-in for the `ibmmq` module. The real package is a native
 * N-API addon whose `postinstall` downloads the IBM MQ redistributable C
 * client, so it is never a dependency of this test suite (see the package
 * README) - every function below reproduces just enough of the real
 * behavior described in `lib/mqi.js` to drive `IbmMqInstrumentation`'s
 * patches, and every callback fires synchronously so no test needs `done()`.
 */
function createFakeMq() {
  let nextId = 0;
  let nextPutError: MQErrorLike | null = null;
  let nextGetError: MQErrorLike | null = null;
  let capturedGetCb: ((...args: unknown[]) => void) | null = null;

  class MQOD {
    ObjectName: string | null = '';
    ObjectType = 0;
    ResolvedQName: string | null = null;
    ResolvedQMgrName: string | null = null;
  }

  class MQAttr {
    constructor(public selector: number, public value?: unknown) {}
  }

  class MQIMPO {
    Options = 0;
  }

  // Opaque, exactly as real MQPD is to this instrumentation - InqMp requires
  // one as an argument but we never read or set any of its fields.
  class MQPD {}

  // Message-handle -> property-name -> value, keyed by the bigint MsgHandle
  // an async Get delivery's GMO carries. Mirrors what a real MsgHandle
  // backs: the set of MQSETMP'd properties on one message.
  let nextMsgHandle = 0n;
  const msgHandleProperties = new Map<bigint, Record<string, string>>();

  const makeQueueManager = (name: string) => ({
    _hConn: ++nextId,
    _name: name,
    _inCB: false,
  });

  return {
    MQC: {
      MQOO_INQUIRE: 0x2000,
      MQOT_Q_MGR: 6,
      MQCA_Q_MGR_IDENTIFIER: 2032,
      MQHM_NONE: 0,
      MQHM_UNUSABLE_HMSG: -1,
      MQIMPO_CONVERT_VALUE: 32,
      MQIMPO_INQ_FIRST: 0,
      MQRC_PROPERTY_NOT_AVAILABLE: 2471,
      // The real value (lib/mqidefs_darwin.js and friends); MQMD.Format is
      // compared against this to recognize an inline RFH2 body.
      MQFMT_RF_HEADER_2: 'MQHRF2',
    },
    MQOD,
    MQAttr,
    MQIMPO,
    MQPD,
    // Real shape (lib/mqstruc.js): `getHeader` parses the fixed part of the
    // RFH2 struct, `getAllProperties` walks the length-prefixed "namevalue"
    // folder strings that follow it. This fake keeps the same two-call
    // shape and the same length-prefixed layout, without the real fixed
    // header fields this instrumentation never reads.
    MQRFH2: {
      getHeader(buf: Buffer) {
        return { StrucLength: buf.length };
      },
      getAllProperties(hdr: { StrucLength: number }, buf: Buffer) {
        const props: string[] = [];
        let offset = 0;
        while (offset < hdr.StrucLength) {
          const len = buf.readUInt32LE(offset);
          offset += 4;
          props.push(buf.toString('utf8', offset, offset + len));
          offset += len;
        }
        return props;
      },
    },

    // Test-only seam: makes the *next* Put/PutSync call fail, to exercise
    // the reconnect-invalidation path without a real broken connection.
    __setNextPutError(err: MQErrorLike | null) {
      nextPutError = err;
    },
    // Test-only seam: makes the *next* GetSync call fail, e.g. with the
    // MQRC_NO_MSG_AVAILABLE timeout every polling consumer sees routinely.
    __setNextGetError(err: MQErrorLike | null) {
      nextGetError = err;
    },
    // Test-only seam: fires the callback `Get()` registered, standing in
    // for a real MQGET completion (message or error) on the async listener.
    __triggerGet(...args: unknown[]) {
      capturedGetCb?.(...args);
    },
    // Test-only seam: a GMO-shaped object carrying a fresh MsgHandle, with
    // the given message properties available to be found by InqMp, standing
    // in for what a real async Get delivery's GMO would carry after IBM's
    // client populated it from the wire.
    __createMessageHandle(props: Record<string, string> = {}) {
      nextMsgHandle += 1n;
      const msgHandle = nextMsgHandle;
      msgHandleProperties.set(msgHandle, props);
      return { MsgHandle: msgHandle, Options: 0 };
    },
    // `InqMp(jsQueueManager, jsHMsg, jsimpo, jspd, jsName, valueBuffer, cb)`
    // (lib/mqi.js): synchronous, callback-shaped exactly like the real one -
    // `(err, returnedName, value, propsLen, type)` - including the
    // MQRC_PROPERTY_NOT_AVAILABLE error a real broker returns for a message
    // property that was never set.
    InqMp(
      _hConn: unknown,
      hMsg: bigint,
      _impo: InstanceType<typeof MQIMPO>,
      _pd: InstanceType<typeof MQPD>,
      name: string,
      _valueBuffer: Buffer,
      cb: (
        err: MQErrorLike | null,
        returnedName?: string,
        value?: string,
        propsLen?: number,
        type?: number
      ) => void
    ) {
      const value = msgHandleProperties.get(hMsg)?.[name];
      if (value === undefined) {
        cb(
          Object.assign(new Error('MQRC_PROPERTY_NOT_AVAILABLE'), {
            mqcc: 2,
            mqrc: 2471,
            verb: 'MQINQMP',
          })
        );
        return;
      }
      cb(null, name, value, value.length, 0);
    },

    Conn(qMgrName: string, cb: (err: null, hConn: unknown) => void) {
      cb(null, makeQueueManager(qMgrName));
    },
    Connx(
      qMgrName: string,
      _cno: unknown,
      cb: (err: null, hConn: unknown) => void
    ) {
      cb(null, makeQueueManager(qMgrName));
    },
    ConnSync(qMgrName: string, cb?: (err: null, hConn: unknown) => void) {
      const hConn = makeQueueManager(qMgrName);
      if (cb) {
        cb(null, hConn);
        return undefined;
      }
      return hConn;
    },
    ConnxSync(
      qMgrName: string,
      _cno: unknown,
      cb?: (err: null, hConn: unknown) => void
    ) {
      const hConn = makeQueueManager(qMgrName);
      if (cb) {
        cb(null, hConn);
        return undefined;
      }
      return hConn;
    },

    // Mirrors the live-lab fixture: alias TEST.ALIAS.Q resolves to
    // DEV.QUEUE.1 on AryanMacOSQM1, same as a real `mq.Open` mutates `jsod`
    // in place for an alias/clustered/dynamic-reply queue.
    Open(
      hConn: unknown,
      jsod: InstanceType<typeof MQOD>,
      _options: number,
      cb: (err: null, hObj: unknown) => void
    ) {
      if (jsod.ObjectName === 'TEST.ALIAS.Q') {
        jsod.ResolvedQName = 'DEV.QUEUE.1';
        jsod.ResolvedQMgrName = 'AryanMacOSQM1';
      }
      cb(null, {
        _hObj: ++nextId,
        _mqQueueManager: hConn,
        _name: jsod.ObjectName,
      });
    },
    OpenSync(
      hConn: unknown,
      jsod: InstanceType<typeof MQOD>,
      _options: number,
      cb?: (err: null, hObj: unknown) => void
    ) {
      if (jsod.ObjectName === 'TEST.ALIAS.Q') {
        jsod.ResolvedQName = 'DEV.QUEUE.1';
        jsod.ResolvedQMgrName = 'AryanMacOSQM1';
      }
      const hObj = {
        _hObj: ++nextId,
        _mqQueueManager: hConn,
        _name: jsod.ObjectName,
      };
      if (cb) {
        cb(null, hObj);
        return undefined;
      }
      return hObj;
    },
    // Real `mq.Close` is asynchronous - it is not among the verbs that consult
    // `connInCB` to force themselves synchronous. A synchronous fake here is
    // what previously let the QMID-inquiry deferral bug pass the suite, so it
    // deliberately defers.
    Close(_hObj: unknown, _options: number, cb: (err: null) => void) {
      setImmediate(() => cb(null));
    },
    // `CloseSync` passes `async = false` unconditionally in lib/mqi.js.
    CloseSync(_hObj: unknown, _options: number, cb: (err: null) => void) {
      cb(null);
    },
    Inq(
      _hObj: unknown,
      selectors: InstanceType<typeof MQAttr>[],
      cb: (err: null, selectors: InstanceType<typeof MQAttr>[]) => void
    ) {
      cb(
        null,
        selectors.map(sel =>
          sel.selector === 2032
            ? new MQAttr(sel.selector, FAKE_QMID_PADDED)
            : sel
        )
      );
    },

    Put(
      jsObject: unknown,
      _jsmd: unknown,
      _jspmo: unknown,
      _buf: unknown,
      cb: (err: MQErrorLike | null) => void
    ) {
      const err = nextPutError;
      nextPutError = null;
      cb(err);
    },
    PutSync(
      _jsObject: unknown,
      _jsmd: unknown,
      _jspmo: unknown,
      _buf: unknown,
      cb?: (err: MQErrorLike | null) => void
    ) {
      const err = nextPutError;
      nextPutError = null;
      if (cb) {
        cb(err);
        return undefined;
      }
      if (err) throw err;
      return undefined;
    },
    // Mirrors the same alias fixture as Open/OpenSync above: MQ only writes
    // ResolvedQName onto `jsod` as a side effect of the Put1 call itself, not
    // before it - callers must read it after this function runs.
    Put1(
      _hConn: unknown,
      jsod: InstanceType<typeof MQOD>,
      _jsmd: unknown,
      _jspmo: unknown,
      _buf: unknown,
      cb: (err: MQErrorLike | null) => void
    ) {
      if (jsod.ObjectName === 'TEST.ALIAS.Q') {
        jsod.ResolvedQName = 'DEV.QUEUE.1';
        jsod.ResolvedQMgrName = 'AryanMacOSQM1';
      }
      const err = nextPutError;
      nextPutError = null;
      cb(err);
    },
    Put1Sync(
      _hConn: unknown,
      jsod: InstanceType<typeof MQOD>,
      _jsmd: unknown,
      _jspmo: unknown,
      _buf: unknown,
      cb?: (err: MQErrorLike | null) => void
    ) {
      if (jsod.ObjectName === 'TEST.ALIAS.Q') {
        jsod.ResolvedQName = 'DEV.QUEUE.1';
        jsod.ResolvedQMgrName = 'AryanMacOSQM1';
      }
      const err = nextPutError;
      nextPutError = null;
      if (cb) {
        cb(err);
        return undefined;
      }
      if (err) throw err;
      return undefined;
    },
    GetSync(
      _jsObject: unknown,
      _jsmd: unknown,
      _jsgmo: unknown,
      _buf: unknown,
      cb?: (err: MQErrorLike | null, len?: number) => void
    ) {
      const err = nextGetError;
      nextGetError = null;
      if (cb) {
        cb(err, err ? undefined : 0);
        return undefined;
      }
      if (err) throw err;
      return 0;
    },
    Get(
      _jsObject: unknown,
      _jsmd: unknown,
      _jsgmo: unknown,
      cb: (...args: unknown[]) => void
    ) {
      // Real `Get` never calls back synchronously - delivery is driven by
      // `Ctl(hConn, MQOP_START)`; tests fire it manually via `__triggerGet`.
      capturedGetCb = cb;
    },
    GetDone() {
      /* not exercised by these tests */
    },
    Ctl(_hConn: unknown, _op: number, cb?: () => void) {
      cb?.();
    },
  };
}

describe('ibmmq instrumentation', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mq: any;

  beforeEach(() => {
    mq = createFakeMq();
    // Bypasses `require-in-the-middle` entirely - this package deliberately
    // never depends on the real `ibmmq` native addon (see README), so tests
    // drive the patched module exports directly instead of requiring it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (instrumentation as any).patch(mq);
  });

  it('does not stamp a QMID by default', () => {
    const hConn = mq.ConnSync('TESTQM');
    const hObj = { _mqQueueManager: hConn, _name: 'TEST.QUEUE' };

    mq.PutSync(hObj, {}, {}, Buffer.from('hi'));

    const spans = getTestSpans();
    assert.strictEqual(spans.length, 1);
    const [span] = spans;
    assert.strictEqual(span.name, 'send TEST.QUEUE');
    assert.strictEqual(span.kind, SpanKind.PRODUCER);
    assert.strictEqual(
      span.attributes[ATTR_MESSAGING_SYSTEM],
      MESSAGING_SYSTEM_VALUE_IBMMQ
    );
    assert.strictEqual(
      span.attributes[ATTR_MESSAGING_DESTINATION_NAME],
      'TEST.QUEUE'
    );
    assert.strictEqual(span.attributes[ATTR_MESSAGING_OPERATION_NAME], 'send');
    assert.strictEqual(
      span.attributes[ATTR_MESSAGING_IBMMQ_QUEUE_MANAGER_ID],
      undefined
    );
  });

  it('prefers the queue name MQ resolved at Open over the requested name', () => {
    const hConn = mq.ConnSync('TESTQM');

    // Mirrors the live-lab fixture: alias TEST.ALIAS.Q resolves to
    // DEV.QUEUE.1. `Open` mutates `od` in place, same as a real `mq.Open`.
    const od = new mq.MQOD();
    od.ObjectName = 'TEST.ALIAS.Q';
    const aliasObj = mq.OpenSync(hConn, od, 0);
    mq.PutSync(aliasObj, {}, {}, Buffer.from('hi'));

    // An MQObject never opened through the Open/OpenSync patch (e.g. built
    // directly by other test/application code) has no resolved-name entry
    // and must fall back to `_name`.
    const plainObj = { _mqQueueManager: hConn, _name: 'TEST.QUEUE' };
    mq.PutSync(plainObj, {}, {}, Buffer.from('hi'));

    const [aliasSpan, plainSpan] = getTestSpans();
    assert.strictEqual(
      aliasSpan.attributes[ATTR_MESSAGING_DESTINATION_NAME],
      'DEV.QUEUE.1'
    );
    assert.strictEqual(
      plainSpan.attributes[ATTR_MESSAGING_DESTINATION_NAME],
      'TEST.QUEUE'
    );
  });

  it('prefers the queue name MQ resolved during the Put1/Put1Sync call itself over the requested name', () => {
    const hConn = mq.ConnSync('TESTQM');

    // Unlike Open, MQ only writes ResolvedQName onto the MQOD as a side
    // effect of Put1 completing - the span must reflect that post-call value,
    // not whatever ResolvedQName held (nothing) when the span was opened.
    const put1Od = new mq.MQOD();
    put1Od.ObjectName = 'TEST.ALIAS.Q';
    mq.Put1(hConn, put1Od, {}, {}, Buffer.from('hi'), () => {});

    const put1SyncOd = new mq.MQOD();
    put1SyncOd.ObjectName = 'TEST.ALIAS.Q';
    mq.Put1Sync(hConn, put1SyncOd, {}, {}, Buffer.from('hi'));

    const [put1Span, put1SyncSpan] = getTestSpans();
    assert.strictEqual(put1Span.name, 'send DEV.QUEUE.1');
    assert.strictEqual(
      put1Span.attributes[ATTR_MESSAGING_DESTINATION_NAME],
      'DEV.QUEUE.1'
    );
    assert.strictEqual(put1SyncSpan.name, 'send DEV.QUEUE.1');
    assert.strictEqual(
      put1SyncSpan.attributes[ATTR_MESSAGING_DESTINATION_NAME],
      'DEV.QUEUE.1'
    );
  });

  it('stamps the QMID cached at connect time when enabled', () => {
    instrumentation.setConfig({ emitQueueManagerId: true });

    const hConn = mq.ConnSync('TESTQM');
    // This fake resolves the inquiry synchronously; a real broker never
    // does (session handoff section 21.6 - MQINQ is a network round trip),
    // but the cache contract is the same either way.
    assert.strictEqual(connectionMetaMap.get(hConn)?.qmid, FAKE_QMID);

    const hObj = { _mqQueueManager: hConn, _name: 'TEST.QUEUE' };
    mq.PutSync(hObj, {}, {}, Buffer.from('hi'));

    const [span] = getTestSpans();
    assert.strictEqual(
      span.attributes[ATTR_MESSAGING_IBMMQ_QUEUE_MANAGER_ID],
      FAKE_QMID
    );
  });

  it('has the QMID cached before the connect callback runs its first operation', done => {
    instrumentation.setConfig({ emitQueueManagerId: true });

    // The live failure shape: a short-lived app that connects and immediately
    // publishes. The inquiry must complete in the connect callback's own tick,
    // or the very first span silently loses the join key.
    mq.Connx('TESTQM', {}, (err: unknown, hConn: any) => {
      assert.ifError(err);
      assert.strictEqual(connectionMetaMap.get(hConn)?.qmid, FAKE_QMID);

      const od = new mq.MQOD();
      od.ObjectName = 'TEST.QUEUE';
      mq.Put1(hConn, od, {}, {}, Buffer.from('immediate'), (perr: unknown) => {
        assert.ifError(perr);

        const [span] = getTestSpans();
        assert.strictEqual(
          span.attributes[ATTR_MESSAGING_IBMMQ_QUEUE_MANAGER_ID],
          FAKE_QMID
        );
        done();
      });
    });
  });

  it('stamps a span for both mq.Put(...) and destructured Put(...) call styles', done => {
    instrumentation.setConfig({ emitQueueManagerId: true });

    const hConn = mq.ConnSync('TESTQM');
    const hObj = { _mqQueueManager: hConn, _name: 'TEST.QUEUE' };

    mq.Put(hObj, {}, {}, Buffer.from('a'), (err: unknown) => {
      assert.ifError(err);

      const { Put } = mq;
      Put(hObj, {}, {}, Buffer.from('b'), (err2: unknown) => {
        assert.ifError(err2);

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 2);
        for (const span of spans) {
          assert.strictEqual(span.name, 'send TEST.QUEUE');
          assert.strictEqual(span.kind, SpanKind.PRODUCER);
          assert.strictEqual(
            span.attributes[ATTR_MESSAGING_IBMMQ_QUEUE_MANAGER_ID],
            FAKE_QMID
          );
        }
        done();
      });
    });
  });

  it('drops the cached QMID and marks the span on a reconnect-shaped MQError', () => {
    instrumentation.setConfig({ emitQueueManagerId: true });

    const hConn = mq.ConnSync('TESTQM');
    assert.strictEqual(connectionMetaMap.get(hConn)?.qmid, FAKE_QMID);

    const hObj = { _mqQueueManager: hConn, _name: 'TEST.QUEUE' };
    const reconnectErr: MQErrorLike = Object.assign(
      new Error('MQRC_RECONNECTED'),
      { mqcc: 1, mqrc: 2545, verb: 'MQPUT' }
    );
    mq.__setNextPutError(reconnectErr);

    mq.PutSync(hObj, {}, {}, Buffer.from('x'), (err: unknown) => {
      assert.strictEqual(err, reconnectErr);
    });

    assert.strictEqual(connectionMetaMap.has(hConn), false);

    const [failedSpan] = getTestSpans();
    assert.strictEqual(failedSpan.status.code, SpanStatusCode.ERROR);

    // Per `ensureQueueManagerId`'s contract, the operation that finds the
    // cache empty re-fires the inquiry but reports no QMID on its own span;
    // the next operation on the same connection finds it cached again.
    mq.PutSync(hObj, {}, {}, Buffer.from('y'));
    const [, retrySpan] = getTestSpans();
    assert.strictEqual(
      retrySpan.attributes[ATTR_MESSAGING_IBMMQ_QUEUE_MANAGER_ID],
      undefined
    );

    mq.PutSync(hObj, {}, {}, Buffer.from('z'));
    const [, , recachedSpan] = getTestSpans();
    assert.strictEqual(
      recachedSpan.attributes[ATTR_MESSAGING_IBMMQ_QUEUE_MANAGER_ID],
      FAKE_QMID
    );
  });

  it('leaves the span UNSET for MQRC_NO_MSG_AVAILABLE but ERROR for a real failure, on GetSync', () => {
    const hConn = mq.ConnSync('TESTQM');
    const hObj = { _mqQueueManager: hConn, _name: 'TEST.QUEUE' };

    const noMsgAvailable: MQErrorLike = Object.assign(
      new Error('MQRC_NO_MSG_AVAILABLE'),
      { mqcc: 2, mqrc: 2033, verb: 'MQGET' }
    );
    mq.__setNextGetError(noMsgAvailable);
    mq.GetSync(hObj, {}, {}, Buffer.alloc(0), (err: unknown) => {
      assert.strictEqual(err, noMsgAvailable);
    });

    const [timeoutSpan] = getTestSpans();
    assert.strictEqual(timeoutSpan.status.code, SpanStatusCode.UNSET);
    assert.strictEqual(timeoutSpan.events.length, 0);

    const truncated: MQErrorLike = Object.assign(
      new Error('MQRC_TRUNCATED_MSG_FAILED'),
      { mqcc: 2, mqrc: 2080, verb: 'MQGET' }
    );
    mq.__setNextGetError(truncated);
    mq.GetSync(hObj, {}, {}, Buffer.alloc(0), (err: unknown) => {
      assert.strictEqual(err, truncated);
    });

    const [, realFailureSpan] = getTestSpans();
    assert.strictEqual(realFailureSpan.status.code, SpanStatusCode.ERROR);
  });

  it('applies the same MQRC_NO_MSG_AVAILABLE/real-failure distinction on the async Get callback', () => {
    const hConn = mq.ConnSync('TESTQM');
    const hObj = { _mqQueueManager: hConn, _name: 'TEST.QUEUE' };

    mq.Get(hObj, {}, {}, () => {
      /* app's async delivery callback; not asserted on here */
    });

    const noMsgAvailable: MQErrorLike = Object.assign(
      new Error('MQRC_NO_MSG_AVAILABLE'),
      { mqcc: 2, mqrc: 2033, verb: 'MQGET' }
    );
    mq.__triggerGet(noMsgAvailable, undefined);

    const [timeoutSpan] = getTestSpans();
    assert.strictEqual(timeoutSpan.status.code, SpanStatusCode.UNSET);
    assert.strictEqual(timeoutSpan.events.length, 0);

    const connectionBroken: MQErrorLike = Object.assign(
      new Error('MQRC_CONNECTION_BROKEN'),
      { mqcc: 2, mqrc: 2009, verb: 'MQGET' }
    );
    mq.__triggerGet(connectionBroken, undefined);

    const [, realFailureSpan] = getTestSpans();
    assert.strictEqual(realFailureSpan.status.code, SpanStatusCode.ERROR);
  });

  it('exposes invalidateOnReconnect as a standalone unit for non-reconnect errors', () => {
    const hConn = mq.ConnSync('TESTQM');
    connectionMetaMap.set(hConn, { qmid: FAKE_QMID });

    const notAuthorized: MQErrorLike = Object.assign(
      new Error('MQRC_NOT_AUTHORIZED'),
      { mqcc: 2, mqrc: 2035, verb: 'MQPUT' }
    );
    invalidateOnReconnect(hConn, notAuthorized);
    assert.strictEqual(connectionMetaMap.get(hConn)?.qmid, FAKE_QMID);

    const connectionBroken: MQErrorLike = Object.assign(
      new Error('MQRC_CONNECTION_BROKEN'),
      { mqcc: 2, mqrc: 2009, verb: 'MQPUT' }
    );
    invalidateOnReconnect(hConn, connectionBroken);
    assert.strictEqual(connectionMetaMap.has(hConn), false);
  });

  it('parents the async process span on the traceparent carried by the message handle', () => {
    const hConn = mq.ConnSync('TESTQM');
    const hObj = { _mqQueueManager: hConn, _name: 'TEST.QUEUE' };

    mq.Get(hObj, {}, {}, () => {
      /* app's async delivery callback; not asserted on here */
    });

    // IBM's own mqiotel.js hook runs one line before our wrapped callback,
    // so by the time this instrumentation could add a link, there is no
    // span to add it to - `messageParentContext` reads the same property
    // off the same MsgHandle instead, and uses it as the span's parent.
    const traceId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const spanId = 'bbbbbbbbbbbbbbbb';
    const gmo = mq.__createMessageHandle({
      traceparent: `00-${traceId}-${spanId}-01`,
    });

    mq.__triggerGet(null, hObj, gmo, {}, Buffer.alloc(0), hConn);

    const [span] = getTestSpans();
    assert.strictEqual(span.name, 'process TEST.QUEUE');
    assert.strictEqual(span.parentSpanContext?.traceId, traceId);
    assert.strictEqual(span.parentSpanContext?.spanId, spanId);
    assert.strictEqual(span.spanContext().traceId, traceId);
  });

  it('parents the async process span on a traceparent carried inline in an RFH2 body when no message handle was created', () => {
    const hConn = mq.ConnSync('TESTQM');
    const hObj = { _mqQueueManager: hConn, _name: 'TEST.QUEUE' };

    mq.Get(hObj, {}, {}, () => {
      /* app's async delivery callback; not asserted on here */
    });

    // The common default case per mqiotel.js's getTraceBefore: the app did
    // not ask for MQGMO_NO_PROPERTIES (or PROPCTL NONE), so IBM never
    // created a message handle for this delivery at all - MsgHandle comes
    // back as MQHM_NONE, and the properties travel inline in the RFH2 body
    // instead, in a <usr> folder.
    const traceId = 'cccccccccccccccccccccccccccccccc';
    const spanId = 'dddddddddddddddd';
    const gmo = { MsgHandle: BigInt(mq.MQC.MQHM_NONE), Options: 0 };
    const md = { Format: mq.MQC.MQFMT_RF_HEADER_2 };
    const buf = encodeRfh2Folders([
      `<usr><traceparent>00-${traceId}-${spanId}-01</traceparent></usr>`,
    ]);

    mq.__triggerGet(null, hObj, gmo, md, buf, hConn);

    const [span] = getTestSpans();
    assert.strictEqual(span.name, 'process TEST.QUEUE');
    assert.strictEqual(span.parentSpanContext?.traceId, traceId);
    assert.strictEqual(span.parentSpanContext?.spanId, spanId);
    assert.strictEqual(span.spanContext().traceId, traceId);
  });

  it('leaves the async process span rootless on a non-RFH2 format with no message handle, without throwing', () => {
    const hConn = mq.ConnSync('TESTQM');
    const hObj = { _mqQueueManager: hConn, _name: 'TEST.QUEUE' };

    mq.Get(hObj, {}, {}, () => {
      /* app's async delivery callback; not asserted on here */
    });

    const gmo = { MsgHandle: BigInt(mq.MQC.MQHM_NONE), Options: 0 };
    const md = { Format: 'MQSTR' };
    const buf = Buffer.from('plain text body, not RFH2');

    assert.doesNotThrow(() => {
      mq.__triggerGet(null, hObj, gmo, md, buf, hConn);
    });

    const [span] = getTestSpans();
    assert.strictEqual(span.name, 'process TEST.QUEUE');
    assert.strictEqual(span.parentSpanContext, undefined);
  });

  it('leaves the async process span rootless on a malformed RFH2 buffer, without throwing', () => {
    const hConn = mq.ConnSync('TESTQM');
    const hObj = { _mqQueueManager: hConn, _name: 'TEST.QUEUE' };

    mq.Get(hObj, {}, {}, () => {
      /* app's async delivery callback; not asserted on here */
    });

    const gmo = { MsgHandle: BigInt(mq.MQC.MQHM_NONE), Options: 0 };
    const md = { Format: mq.MQC.MQFMT_RF_HEADER_2 };
    // Too short to even hold one length-prefixed folder's 4-byte length -
    // the fake's (and the real parser's) length read runs past the end of
    // the buffer, the same shape of failure a corrupted or truncated RFH2
    // body would produce against the real `MQRFH2.getAllProperties`.
    const buf = Buffer.alloc(2);

    assert.doesNotThrow(() => {
      mq.__triggerGet(null, hObj, gmo, md, buf, hConn);
    });

    const [span] = getTestSpans();
    assert.strictEqual(span.name, 'process TEST.QUEUE');
    assert.strictEqual(span.parentSpanContext, undefined);
  });

  it('leaves the async process span rootless when the message carries no traceparent, ignoring any ambient span', () => {
    const hConn = mq.ConnSync('TESTQM');
    const hObj = { _mqQueueManager: hConn, _name: 'TEST.QUEUE' };

    mq.Get(hObj, {}, {}, () => {
      /* app's async delivery callback; not asserted on here */
    });

    // A message with no properties at all - the ordinary case for a message
    // whose producer never propagated a context.
    const gmo = mq.__createMessageHandle();

    // Whatever is ambient when the listener fires must be ignored: inheriting
    // it is exactly what produced the unbounded receive-span chain fixed
    // alongside this (see the GetSync caller-context test below).
    const ambientSpan = trace.getTracer('test-ambient').startSpan('ambient');
    context.with(trace.setSpan(context.active(), ambientSpan), () => {
      mq.__triggerGet(null, hObj, gmo, {}, Buffer.alloc(0), hConn);
    });
    ambientSpan.end();

    const processSpan = getTestSpans().find(
      span => span.name === 'process TEST.QUEUE'
    );
    assert.ok(processSpan);
    assert.strictEqual(processSpan!.parentSpanContext, undefined);
    assert.notStrictEqual(
      processSpan!.spanContext().traceId,
      ambientSpan.spanContext().traceId
    );
  });

  it("runs the GetSync application callback in the caller's context, not the receive span's", () => {
    const hConn = mq.ConnSync('TESTQM');
    const hObj = { _mqQueueManager: hConn, _name: 'TEST.QUEUE' };

    const callerSpan = trace.getTracer('test-caller').startSpan('caller');
    let spanSeenByCallback: ReturnType<typeof trace.getSpan>;

    context.with(trace.setSpan(context.active(), callerSpan), () => {
      mq.GetSync(hObj, {}, {}, Buffer.alloc(0), () => {
        spanSeenByCallback = trace.getSpan(context.active());
      });
    });
    callerSpan.end();

    // Not the receive span - binding the app's callback to `context.active()`
    // at the point `callAndEndSpan` runs (inside our own
    // `context.with(trace.setSpan(...), ...)`) is what previously leaked our
    // span into anything the app schedules from its callback, e.g. a
    // `setImmediate` poll loop, chaining the next span onto this one.
    assert.strictEqual(spanSeenByCallback, callerSpan);
  });
});
