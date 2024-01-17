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

export interface TestContext {
  stream: Writable;
  writeSpy: sinon.SinonSpy;
  logger: Pino.Logger;
}

export interface TestInstrumentation {
  instrumentation: PinoInstrumentation;
  pino: typeof Pino;
}

export type TestInstrumentationAndContext = TestContext & TestInstrumentation;

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
  testContext: TestContext,
  expectedKeys?: PinoInstrumentationConfig['logKeys']
) {
  sinon.assert.calledOnce(testContext.writeSpy);
  const record = JSON.parse(testContext.writeSpy.firstCall.args[0].toString());
  assertRecord(record, span, expectedKeys);
  return record;
}

export function testInjection(
  span: Span,
  testContext: TestContext,
  expectedKeys?: PinoInstrumentationConfig['logKeys']
) {
  testContext.logger.info(kMessage);
  return assertInjection(span, testContext, expectedKeys);
}

export function testNoInjection(testContext: TestContext) {
  testContext.logger.info(kMessage);
  sinon.assert.calledOnce(testContext.writeSpy);
  const record = JSON.parse(testContext.writeSpy.firstCall.args[0].toString());
  assert.strictEqual(record['trace_id'], undefined);
  assert.strictEqual(record['span_id'], undefined);
  assert.strictEqual(record['trace_flags'], undefined);
  assert.strictEqual(kMessage, record['msg']);
  return record;
}

export function initTestContext(
  testInstrumentation: TestInstrumentation,
  importType: 'global' | 'default' | 'pino' = 'global'
): TestContext {
  const stream = new Writable();
  stream._write = () => {};
  const writeSpy = sinon.spy(stream, 'write');
  const logger =
    importType === 'global'
      ? testInstrumentation.pino(stream)
      : // @ts-expect-error the same function reexported
        testInstrumentation.pino[importType](stream);

  return { stream, writeSpy, logger };
}

export function setupInstrumentation(
  config?: PinoInstrumentationConfig
): TestInstrumentation {
  const instrumentation = new PinoInstrumentation(config);
  if (config?.enabled !== false) {
    instrumentation.enable();
  }
  const pino = require('pino');
  return { instrumentation, pino };
}

export function setupInstrumentationAndInitTestContext(
  config?: PinoInstrumentationConfig,
  importType: 'global' | 'default' | 'pino' = 'global'
) {
  const instrumentation = setupInstrumentation(config);
  const context = initTestContext(instrumentation, importType);
  return { ...instrumentation, ...context };
}
