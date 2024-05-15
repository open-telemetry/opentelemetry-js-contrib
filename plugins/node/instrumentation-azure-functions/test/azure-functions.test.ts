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
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';
import { AzureFunctionsInstrumentation } from '../src';

const instrumentation = registerInstrumentationTesting(
  new AzureFunctionsInstrumentation()
);

import * as assert from 'assert';
import * as sinon from 'sinon';
import { trace } from '@opentelemetry/api';
import {
  HttpRequest,
  InvocationContext,
  PreInvocationContext,
  PreInvocationHandler,
  TraceContext,
  app,
} from '@azure/functions';

describe('Azure Functions', () => {
  const preInvocHookStub = sinon.stub(app.hook, 'preInvocation');
  let preInvocationHook: PreInvocationHandler;

  beforeEach(() => {
    instrumentation.disable();
    preInvocHookStub.reset();
    instrumentation.enable();
    preInvocationHook = preInvocHookStub.getCall(0).args[0];
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
});
