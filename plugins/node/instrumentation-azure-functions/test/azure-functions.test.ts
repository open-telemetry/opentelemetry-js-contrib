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

import { trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { AzureFunctionsInstrumentation } from '../src';

const instrumentation = registerInstrumentationTesting(
  new AzureFunctionsInstrumentation()
);

const loggerProvider = new LoggerProvider();
const memoryLogExporter = new InMemoryLogRecordExporter();
loggerProvider.addLogRecordProcessor(
  new SimpleLogRecordProcessor(memoryLogExporter)
);
instrumentation.setLoggerProvider(loggerProvider);
logs.setGlobalLoggerProvider(loggerProvider);

import {
  HttpRequest,
  InvocationContext,
  LogHookHandler,
  LogLevel,
  PreInvocationContext,
  PreInvocationHandler,
  TraceContext,
  app,
} from '@azure/functions';
import * as assert from 'assert';
import * as sinon from 'sinon';

describe('Azure Functions', () => {
  const preInvocHookStub = sinon.stub(app.hook, 'preInvocation');
  const logHookStub = sinon.stub(app.hook, 'log');
  let preInvocationHook: PreInvocationHandler;
  let logHook: LogHookHandler;

  beforeEach(() => {
    instrumentation.disable();
    preInvocHookStub.reset();
    logHookStub.reset();
    instrumentation.enable();
    preInvocationHook = preInvocHookStub.getCall(0).args[0];
    logHook = logHookStub.getCall(0).args[0];
  });

  function mockHttpTrigger(traceContext?: TraceContext) {
    const invocationContext = new InvocationContext({
      functionName: 'httpTrigger1',
      invocationId: '8dd01095-3636-4526-9310-af061277b0a2',
      traceContext,
    });

    const preInvocContext = new PreInvocationContext({
      invocationContext,
      functionCallback: () => {
        const childSpan = trace
          .getTracer('default')
          .startSpan('httpTrigger1ChildSpan');
        childSpan.end();
      },
    });

    preInvocationHook(preInvocContext);
    const request = new HttpRequest({
      method: 'GET',
      url: 'http://localhost:7071/api/httpTrigger1',
    });
    preInvocContext.functionHandler(request, invocationContext);
  }

  it('invocation should use trace context', async () => {
    mockHttpTrigger({
      traceParent: '00-513e591bae56202be488eebfeaae7832-210c10090e6061c1-01',
    });

    const spans = getTestSpans();
    assert.strictEqual(spans.length, 1);
    const [span] = spans;
    assert.strictEqual(span.parentSpanId, '210c10090e6061c1');
  });

  it('invocation should ignore missing trace context', async () => {
    mockHttpTrigger();

    const spans = getTestSpans();
    assert.strictEqual(spans.length, 1);
    const [span] = spans;
    assert.strictEqual(span.parentSpanId, undefined);
  });

  it('log hook severity conversion', async () => {
    const levels: LogLevel[] = [
      'information',
      'debug',
      'error',
      'trace',
      'warning',
      'critical',
      'none',
    ];
    for (const level of levels) {
      logHook({
        level,
        category: 'user',
        message: level,
        invocationContext: undefined,
        hookData: {},
      });
    }

    const logRecords = memoryLogExporter.getFinishedLogRecords();
    assert.strictEqual(logRecords.length, 7);
    assert.strictEqual(logRecords[0].body, 'information');
    assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.INFO);
    assert.strictEqual(logRecords[1].body, 'debug');
    assert.strictEqual(logRecords[1].severityNumber, SeverityNumber.DEBUG);
    assert.strictEqual(logRecords[2].body, 'error');
    assert.strictEqual(logRecords[2].severityNumber, SeverityNumber.ERROR);
    assert.strictEqual(logRecords[3].body, 'trace');
    assert.strictEqual(logRecords[3].severityNumber, SeverityNumber.TRACE);
    assert.strictEqual(logRecords[4].body, 'warning');
    assert.strictEqual(logRecords[4].severityNumber, SeverityNumber.WARN);
    assert.strictEqual(logRecords[5].body, 'critical');
    assert.strictEqual(logRecords[5].severityNumber, SeverityNumber.FATAL);
    assert.strictEqual(logRecords[6].body, 'none');
    assert.strictEqual(
      logRecords[6].severityNumber,
      SeverityNumber.UNSPECIFIED
    );
  });
});
