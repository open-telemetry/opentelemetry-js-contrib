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

import * as assert from 'assert';
import * as sinon from 'sinon';

import { PinoInstrumentation, PinoInstrumentationConfig } from '../src';

import type { pino as Pino } from 'pino';
import { Span } from '@opentelemetry/api';
import { Writable } from 'stream';

export const kMessage = 'log-message';

export let stream: Writable;
export let writeSpy: sinon.SinonSpy;
export let pino: typeof Pino;
export let instrumentation: PinoInstrumentation;
export let logger: Pino.Logger;

export function assertRecord(
  record: any,
  span: Span,
  expectedKeys?: PinoInstrumentationConfig['logKeys']
) {
  const { traceId, spanId, traceFlags } = span.spanContext();
  assert.strictEqual(record[expectedKeys?.traceId ?? 'trace_id'], traceId);
  assert.strictEqual(record[expectedKeys?.spanId ?? 'span_id'], spanId);
  assert.strictEqual(
    record[expectedKeys?.traceFlags ?? 'trace_flags'],
    `0${traceFlags.toString(16)}`
  );
  assert.strictEqual(kMessage, record['msg']);
}

export function assertInjection(
  span: Span,
  expectedKeys?: PinoInstrumentationConfig['logKeys']
) {
  sinon.assert.calledOnce(writeSpy);
  const record = JSON.parse(writeSpy.firstCall.args[0].toString());
  assertRecord(record, span, expectedKeys);
  return record;
}

export function testInjection(
  span: Span,
  expectedKeys?: PinoInstrumentationConfig['logKeys']
) {
  logger.info(kMessage);
  return assertInjection(span, expectedKeys);
}

export function testNoInjection() {
  logger.info(kMessage);
  sinon.assert.calledOnce(writeSpy);
  const record = JSON.parse(writeSpy.firstCall.args[0].toString());
  assert.strictEqual(record['trace_id'], undefined);
  assert.strictEqual(record['span_id'], undefined);
  assert.strictEqual(record['trace_flags'], undefined);
  assert.strictEqual(kMessage, record['msg']);
  return record;
}

export function init(importType: 'global' | 'default' | 'pino' = 'global') {
  stream = new Writable();
  stream._write = () => {};
  writeSpy = sinon.spy(stream, 'write');
  if (importType === 'global') {
    logger = pino(stream);
  } else {
    // @ts-expect-error the same function reexported
    logger = pino[importType](stream);
  }
}

export function setLogger(log: Pino.Logger) {
  logger = log;
}

export function setup(config?: PinoInstrumentationConfig) {
  instrumentation = new PinoInstrumentation(config);
  if (config?.enabled !== false) {
    instrumentation.enable();
  }
  pino = require('pino');
}
