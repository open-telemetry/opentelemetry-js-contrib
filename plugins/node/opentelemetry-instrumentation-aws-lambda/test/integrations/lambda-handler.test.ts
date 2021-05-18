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

// We access through node_modules to allow it to be patched.
/* eslint-disable node/no-extraneous-require */

import * as path from 'path';

import {
  AwsLambdaInstrumentation,
  AwsLambdaInstrumentationConfig,
} from '../../src';
import {
  BatchSpanProcessor,
  InMemorySpanExporter,
  ReadableSpan,
} from '@opentelemetry/tracing';
import { NodeTracerProvider } from '@opentelemetry/node';
import { Context } from 'aws-lambda';
import * as assert from 'assert';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  SemanticAttributes,
  ResourceAttributes,
} from '@opentelemetry/semantic-conventions';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new BatchSpanProcessor(memoryExporter));
provider.register();

const assertSpanSuccess = (span: ReadableSpan) => {
  assert.strictEqual(span.kind, SpanKind.SERVER);
  assert.strictEqual(span.name, 'my_function');
  assert.strictEqual(
    span.attributes[SemanticAttributes.FAAS_EXECUTION],
    'aws_request_id'
  );
  assert.strictEqual(span.attributes['faas.id'], 'my_arn');
  assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
  assert.strictEqual(span.status.message, undefined);
};

const assertSpanFailure = (span: ReadableSpan) => {
  assert.strictEqual(span.kind, SpanKind.SERVER);
  assert.strictEqual(span.name, 'my_function');
  assert.strictEqual(
    span.attributes[SemanticAttributes.FAAS_EXECUTION],
    'aws_request_id'
  );
  assert.strictEqual(span.attributes['faas.id'], 'my_arn');
  assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
  assert.strictEqual(span.status.message, 'handler error');
  assert.strictEqual(span.events.length, 1);
  assert.strictEqual(
    span.events[0].attributes![SemanticAttributes.EXCEPTION_MESSAGE],
    'handler error'
  );
};

describe('lambda handler', () => {
  let instrumentation: AwsLambdaInstrumentation;

  let oldEnv: NodeJS.ProcessEnv;

  const ctx = {
    functionName: 'my_function',
    invokedFunctionArn: 'my_arn',
    awsRequestId: 'aws_request_id',
  } as Context;

  const initializeHandler = (
    handler: string,
    config: AwsLambdaInstrumentationConfig = {}
  ) => {
    process.env._HANDLER = handler;

    instrumentation = new AwsLambdaInstrumentation(config);
    instrumentation.setTracerProvider(provider);
  };

  const lambdaRequire = (module: string) =>
    require(path.resolve(__dirname, '..', module));

  beforeEach(() => {
    oldEnv = { ...process.env };
    process.env.LAMBDA_TASK_ROOT = path.resolve(__dirname, '..');
  });

  afterEach(() => {
    process.env = oldEnv;
    instrumentation.disable();

    memoryExporter.reset();
  });

  describe('async success handler', () => {
    it('should export a valid span', async () => {
      initializeHandler('lambda-test/async.handler');

      const result = await lambdaRequire('lambda-test/async').handler(
        'arg',
        ctx
      );
      assert.strictEqual(result, 'ok');
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(spans.length, 1);
      assertSpanSuccess(span);
    });

    it('should record error', async () => {
      initializeHandler('lambda-test/async.error');

      let err: Error;
      try {
        await lambdaRequire('lambda-test/async').error('arg', ctx);
      } catch (e) {
        err = e;
      }
      assert.strictEqual(err!.message, 'handler error');
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(spans.length, 1);
      assertSpanFailure(span);
    });

    it('should record string error', async () => {
      initializeHandler('lambda-test/async.stringerror');

      let err: string;
      try {
        await lambdaRequire('lambda-test/async').stringerror('arg', ctx);
      } catch (e) {
        err = e;
      }
      assert.strictEqual(err!, 'handler error');
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assertSpanFailure(span);
    });

    it('context should have parent trace', async () => {
      initializeHandler('lambda-test/async.context');

      const result = await lambdaRequire('lambda-test/async').context(
        'arg',
        ctx
      );
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(span.spanContext.traceId, result);
    });
  });

  describe('sync success handler', () => {
    it('should export a valid span', async () => {
      initializeHandler('lambda-test/sync.handler');

      const result = await new Promise((resolve, reject) => {
        lambdaRequire('lambda-test/sync').handler(
          'arg',
          ctx,
          (err: Error, res: any) => {
            if (err) {
              reject(err);
            } else {
              resolve(res);
            }
          }
        );
      });
      assert.strictEqual(result, 'ok');
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(spans.length, 1);
      assertSpanSuccess(span);
    });

    it('should record error', async () => {
      initializeHandler('lambda-test/sync.error');

      let err: Error;
      try {
        lambdaRequire('lambda-test/sync').error(
          'arg',
          ctx,
          (err: Error, res: any) => {}
        );
      } catch (e) {
        err = e;
      }
      assert.strictEqual(err!.message, 'handler error');
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(spans.length, 1);
      assertSpanFailure(span);
    });

    it('should record error in callback', async () => {
      initializeHandler('lambda-test/sync.callbackerror');

      let err: Error;
      try {
        await new Promise((resolve, reject) => {
          lambdaRequire('lambda-test/sync').callbackerror(
            'arg',
            ctx,
            (err: Error, res: any) => {
              if (err) {
                reject(err);
              } else {
                resolve(res);
              }
            }
          );
        });
      } catch (e) {
        err = e;
      }
      assert.strictEqual(err!.message, 'handler error');
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(spans.length, 1);
      assertSpanFailure(span);
    });

    it('should record string error', async () => {
      initializeHandler('lambda-test/sync.stringerror');

      let err: string;
      try {
        lambdaRequire('lambda-test/sync').stringerror(
          'arg',
          ctx,
          (err: Error, res: any) => {}
        );
      } catch (e) {
        err = e;
      }
      assert.strictEqual(err!, 'handler error');
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(spans.length, 1);
      assertSpanFailure(span);
    });

    it('context should have parent trace', async () => {
      initializeHandler('lambda-test/sync.context');

      const result = await new Promise((resolve, reject) => {
        lambdaRequire('lambda-test/sync').context(
          'arg',
          ctx,
          (err: Error, res: any) => {
            if (err) {
              reject(err);
            } else {
              resolve(res);
            }
          }
        );
      });
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(span.spanContext.traceId, result);
    });
  });

  it('should record string error in callback', async () => {
    initializeHandler('lambda-test/sync.callbackstringerror');

    let err: string;
    try {
      await new Promise((resolve, reject) => {
        lambdaRequire('lambda-test/sync').callbackstringerror(
          'arg',
          ctx,
          (err: Error, res: any) => {
            if (err) {
              reject(err);
            } else {
              resolve(res);
            }
          }
        );
      });
    } catch (e) {
      err = e;
    }
    assert.strictEqual(err!, 'handler error');
    const spans = memoryExporter.getFinishedSpans();
    const [span] = spans;
    assert.strictEqual(spans.length, 1);
    assertSpanFailure(span);
  });

  describe('hooks', () => {
    describe('requestHook', () => {
      it('sync - success', async () => {
        initializeHandler('lambda-test/async.handler', {
          requestHook: (span, _event, context) => {
            span.setAttribute(
              ResourceAttributes.FAAS_NAME,
              context.functionName
            );
          },
        });

        await lambdaRequire('lambda-test/async').handler('arg', ctx);
        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(
          span.attributes[ResourceAttributes.FAAS_NAME],
          ctx.functionName
        );
        assertSpanSuccess(span);
      });
    });

    describe('responseHook', () => {
      const RES_ATTR = 'test.res';
      const ERR_ATTR = 'test.error';

      const config: AwsLambdaInstrumentationConfig = {
        responseHook: (span, err, res) => {
          if (err)
            span.setAttribute(
              ERR_ATTR,
              typeof err === 'string' ? err : err.message
            );
          if (res)
            span.setAttribute(
              RES_ATTR,
              typeof res === 'string' ? res : JSON.stringify(res)
            );
        },
      };
      it('async - success', async () => {
        initializeHandler('lambda-test/async.handler', config);

        const res = await lambdaRequire('lambda-test/async').handler(
          'arg',
          ctx
        );
        const [span] = memoryExporter.getFinishedSpans();
        assert.strictEqual(span.attributes[RES_ATTR], res);
      });

      it('async - error', async () => {
        initializeHandler('lambda-test/async.error', config);

        let err: Error;
        try {
          await lambdaRequire('lambda-test/async').error('arg', ctx);
        } catch (e) {
          err = e;
        }
        const [span] = memoryExporter.getFinishedSpans();
        assert.strictEqual(span.attributes[ERR_ATTR], err!.message);
      });

      it('sync - success', async () => {
        initializeHandler('lambda-test/sync.handler', config);

        const result = await new Promise((resolve, _reject) => {
          lambdaRequire('lambda-test/sync').handler(
            'arg',
            ctx,
            (_err: Error, res: any) => resolve(res)
          );
        });
        const [span] = memoryExporter.getFinishedSpans();
        assert.strictEqual(span.attributes[RES_ATTR], result);
      });

      it('sync - error', async () => {
        initializeHandler('lambda-test/sync.error', config);

        let err: Error;
        try {
          lambdaRequire('lambda-test/sync').error(
            'arg',
            ctx,
            () => {}
          );
        } catch (e) {
          err = e;
        }
        const [span] = memoryExporter.getFinishedSpans();
        assert.strictEqual(span.attributes[ERR_ATTR], err!.message);
      });

      it('sync - callback error', async () => {
        initializeHandler('lambda-test/sync.callbackerror', config);

        let error: Error;
        await new Promise((resolve, _reject) => {
          lambdaRequire('lambda-test/sync').callbackerror(
            'arg',
            ctx,
            (err: Error, _res: any) => {
              error = err;
              resolve({});
            }
          );
        });
        const [span] = memoryExporter.getFinishedSpans();
        assert.strictEqual(span.attributes[ERR_ATTR], error!.message);
      });
    });
  });
});
