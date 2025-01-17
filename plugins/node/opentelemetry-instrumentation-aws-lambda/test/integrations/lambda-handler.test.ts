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
  lambdaMaxInitInMilliseconds,
} from '../../src';
import {
  BatchSpanProcessor,
  InMemorySpanExporter,
  ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Context } from 'aws-lambda';
import * as assert from 'assert';
import {
  ATTR_URL_FULL,
  SEMATTRS_EXCEPTION_MESSAGE,
  SEMATTRS_FAAS_COLDSTART,
  SEMATTRS_FAAS_EXECUTION,
  SEMRESATTRS_FAAS_NAME,
} from '@opentelemetry/semantic-conventions';
import {
  Context as OtelContext,
  context,
  propagation,
  trace,
  SpanContext,
  SpanKind,
  SpanStatusCode,
  TextMapPropagator,
  ROOT_CONTEXT,
  defaultTextMapGetter,
} from '@opentelemetry/api';
import { AWSXRayPropagator } from '@opentelemetry/propagator-aws-xray';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AWSXRayLambdaPropagator } from '@opentelemetry/propagator-aws-xray-lambda';

const memoryExporter = new InMemorySpanExporter();

const assertSpanSuccess = (span: ReadableSpan) => {
  assert.strictEqual(span.kind, SpanKind.SERVER);
  assert.strictEqual(span.name, 'my_function');
  assert.strictEqual(
    span.attributes[SEMATTRS_FAAS_EXECUTION],
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
    span.attributes[SEMATTRS_FAAS_EXECUTION],
    'aws_request_id'
  );
  assert.strictEqual(span.attributes['faas.id'], 'my_arn');
  assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
  assert.strictEqual(span.status.message, 'handler error');
  assert.strictEqual(span.events.length, 1);
  assert.strictEqual(
    span.events[0].attributes![SEMATTRS_EXCEPTION_MESSAGE],
    'handler error'
  );
};

const serializeSpanContext = (
  spanContext: SpanContext,
  propagator: TextMapPropagator
): string => {
  let serialized = '';
  propagator.inject(
    trace.setSpan(context.active(), trace.wrapSpanContext(spanContext)),
    {},
    {
      set(carrier: any, key: string, value: string) {
        serialized = value;
      },
    }
  );
  return serialized;
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

    const provider = new NodeTracerProvider();
    provider.addSpanProcessor(new BatchSpanProcessor(memoryExporter));
    provider.register();

    instrumentation = new AwsLambdaInstrumentation(config);
    instrumentation.setTracerProvider(provider);

    return provider;
  };

  const lambdaRequire = (module: string) =>
    require(path.resolve(__dirname, '..', module));

  const sampledAwsSpanContext: SpanContext = {
    traceId: '8a3c60f7d188f8fa79d48a391a778fa6',
    spanId: '0000000000000456',
    traceFlags: 1,
    isRemote: true,
  };
  const sampledAwsHeader = serializeSpanContext(
    sampledAwsSpanContext,
    new AWSXRayPropagator()
  );

  const sampledGenericSpanContext: SpanContext = {
    traceId: '8a3c60f7d188f8fa79d48a391a778faa',
    spanId: '0000000000000460',
    traceFlags: 1,
    isRemote: true,
  };
  const sampledGenericSpan = serializeSpanContext(
    sampledGenericSpanContext,
    new W3CTraceContextPropagator()
  );

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
      assert.strictEqual(span.parentSpanId, undefined);
    });

    it('should record error', async () => {
      initializeHandler('lambda-test/async.error');

      let err: Error;
      try {
        await lambdaRequire('lambda-test/async').error('arg', ctx);
      } catch (e: any) {
        err = e;
      }
      assert.strictEqual(err!.message, 'handler error');
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(spans.length, 1);
      assertSpanFailure(span);
      assert.strictEqual(span.parentSpanId, undefined);
    });

    it('should record string error', async () => {
      initializeHandler('lambda-test/async.stringerror');

      let err: string;
      try {
        await lambdaRequire('lambda-test/async').stringerror('arg', ctx);
      } catch (e: any) {
        err = e;
      }
      assert.strictEqual(err!, 'handler error');
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assertSpanFailure(span);
      assert.strictEqual(span.parentSpanId, undefined);
    });

    it('context should have parent trace', async () => {
      initializeHandler('lambda-test/async.context');

      const result = await lambdaRequire('lambda-test/async').context(
        'arg',
        ctx
      );
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(span.spanContext().traceId, result);
    });

    it('context should have parent trace', async () => {
      initializeHandler('lambda-test/async.context');

      const result = await lambdaRequire('lambda-test/async').context(
        'arg',
        ctx
      );
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(span.spanContext().traceId, result);
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
      assert.strictEqual(span.parentSpanId, undefined);
    });

    it('should record coldstart', async () => {
      initializeHandler('lambda-test/sync.handler');

      const handlerModule = lambdaRequire('lambda-test/sync');

      const result1 = await new Promise((resolve, reject) => {
        handlerModule.handler('arg', ctx, (err: Error, res: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        });
      });

      const result2 = await new Promise((resolve, reject) => {
        handlerModule.handler('arg', ctx, (err: Error, res: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        });
      });

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2);
      const [span1, span2] = spans;

      assert.strictEqual(result1, 'ok');
      assertSpanSuccess(span1);
      assert.strictEqual(span1.parentSpanId, undefined);
      assert.strictEqual(span1.attributes[SEMATTRS_FAAS_COLDSTART], true);

      assert.strictEqual(result2, 'ok');
      assertSpanSuccess(span2);
      assert.strictEqual(span2.parentSpanId, undefined);
      assert.strictEqual(span2.attributes[SEMATTRS_FAAS_COLDSTART], false);
    });

    it('should record coldstart with provisioned concurrency', async () => {
      process.env.AWS_LAMBDA_INITIALIZATION_TYPE = 'provisioned-concurrency';

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
      assert.strictEqual(span.parentSpanId, undefined);
      assert.strictEqual(span.attributes[SEMATTRS_FAAS_COLDSTART], false);
    });

    it('should record coldstart with proactive initialization', async () => {
      initializeHandler('lambda-test/sync.handler', {
        lambdaStartTime: Date.now() - 2 * lambdaMaxInitInMilliseconds,
      });

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
      assert.strictEqual(span.parentSpanId, undefined);
      assert.strictEqual(span.attributes[SEMATTRS_FAAS_COLDSTART], false);
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
      } catch (e: any) {
        err = e;
      }
      assert.strictEqual(err!.message, 'handler error');
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(spans.length, 1);
      assertSpanFailure(span);
      assert.strictEqual(span.parentSpanId, undefined);
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
      } catch (e: any) {
        err = e;
      }
      assert.strictEqual(err!.message, 'handler error');
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(spans.length, 1);
      assertSpanFailure(span);
      assert.strictEqual(span.parentSpanId, undefined);
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
      } catch (e: any) {
        err = e;
      }
      assert.strictEqual(err!, 'handler error');
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(spans.length, 1);
      assertSpanFailure(span);
      assert.strictEqual(span.parentSpanId, undefined);
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
      assert.strictEqual(span.spanContext().traceId, result);
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
      assert.strictEqual(span.spanContext().traceId, result);
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
    } catch (e: any) {
      err = e;
    }
    assert.strictEqual(err!, 'handler error');
    const spans = memoryExporter.getFinishedSpans();
    const [span] = spans;
    assert.strictEqual(spans.length, 1);
    assertSpanFailure(span);
    assert.strictEqual(span.parentSpanId, undefined);
  });

  describe('with remote parent', () => {
    beforeEach(() => {
      propagation.disable();
    });

    it('uses globally registered propagator', async () => {
      propagation.setGlobalPropagator(new AWSXRayPropagator());
      initializeHandler('lambda-test/async.handler');

      const proxyEvent = {
        headers: {
          'x-amzn-trace-id': sampledAwsHeader,
        },
      };

      const result = await lambdaRequire('lambda-test/async').handler(
        proxyEvent,
        ctx
      );
      assert.strictEqual(result, 'ok');
      const spans = memoryExporter.getFinishedSpans();

      assert.strictEqual(spans.length, 1);
      assert.equal(
        spans[0].spanContext().traceId,
        sampledAwsSpanContext.traceId
      );
      assert.equal(spans[0].parentSpanId, sampledAwsSpanContext.spanId);
    });

    it('can extract context from lambda context env variable using a global propagator', async () => {
      process.env['_X_AMZN_TRACE_ID'] = sampledAwsHeader;
      propagation.setGlobalPropagator(new AWSXRayLambdaPropagator());
      initializeHandler('lambda-test/async.handler');

      const result = await lambdaRequire('lambda-test/async').handler(
        'arg',
        ctx
      );

      assert.strictEqual(result, 'ok');
      const spans = memoryExporter.getFinishedSpans();

      assert.strictEqual(spans.length, 1);
      assert.equal(
        spans[0].spanContext().traceId,
        sampledAwsSpanContext.traceId
      );
      assert.equal(spans[0].parentSpanId, sampledAwsSpanContext.spanId);
    });

    it('used custom eventContextExtractor over global propagator if defined', async () => {
      propagation.setGlobalPropagator(new W3CTraceContextPropagator());
      const customExtractor = (event: any): OtelContext => {
        const propagator = new AWSXRayPropagator();
        return propagator.extract(
          context.active(),
          event.contextCarrier,
          defaultTextMapGetter
        );
      };

      initializeHandler('lambda-test/async.handler', {
        eventContextExtractor: customExtractor,
      });

      const otherEvent = {
        contextCarrier: {
          traceparent: sampledGenericSpan,
          'x-amzn-trace-id': sampledAwsHeader,
        },
      };

      const result = await lambdaRequire('lambda-test/async').handler(
        otherEvent,
        ctx
      );

      assert.strictEqual(result, 'ok');
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(spans.length, 1);
      assertSpanSuccess(span);
      assert.strictEqual(
        span.spanContext().traceId,
        sampledAwsSpanContext.traceId
      );
      assert.strictEqual(span.parentSpanId, sampledAwsSpanContext.spanId);
    });

    it('creates trace from ROOT_CONTEXT eventContextExtractor is provided, and no custom context is found', async () => {
      const customExtractor = (event: any): OtelContext => {
        if (!event.contextCarrier) {
          return ROOT_CONTEXT;
        }

        return propagation.extract(context.active(), event.contextCarrier);
      };

      const provider = initializeHandler('lambda-test/async.handler', {
        eventContextExtractor: customExtractor,
      });

      const testSpan = provider.getTracer('test').startSpan('random_span');
      await context.with(
        trace.setSpan(context.active(), testSpan),
        async () => {
          await lambdaRequire('lambda-test/async').handler(
            { message: 'event with no context' },
            ctx
          );
        }
      );

      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(span.parentSpanId, undefined);
    });
  });

  describe('hooks', () => {
    describe('requestHook', () => {
      it('sync - success', async () => {
        initializeHandler('lambda-test/async.handler', {
          requestHook: (span, { context }) => {
            span.setAttribute(SEMRESATTRS_FAAS_NAME, context.functionName);
          },
        });

        await lambdaRequire('lambda-test/async').handler('arg', ctx);
        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(
          span.attributes[SEMRESATTRS_FAAS_NAME],
          ctx.functionName
        );
        assertSpanSuccess(span);
      });
    });

    describe('responseHook', () => {
      const RES_ATTR = 'test.res';
      const ERR_ATTR = 'test.error';

      const config: AwsLambdaInstrumentationConfig = {
        responseHook: (span, { err, res }) => {
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
        } catch (e: any) {
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
          lambdaRequire('lambda-test/sync').error('arg', ctx, () => {});
        } catch (e: any) {
          err = e;
        }
        const [span] = memoryExporter.getFinishedSpans();
        assert.strictEqual(span.attributes[ERR_ATTR], err!.message);
      });

      it('sync - error with callback', async () => {
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

    describe('.cjs lambda bundle', () => {
      it('should export a valid span', async () => {
        initializeHandler('lambda-test/commonjs.handler');
        const result = await lambdaRequire('lambda-test/commonjs.cjs').handler(
          'arg',
          ctx
        );
        assert.strictEqual(result, 'ok');
        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assert.strictEqual(spans.length, 1);
        assertSpanSuccess(span);
        assert.strictEqual(span.parentSpanId, undefined);
      });
    });
  });

  describe('custom handler', () => {
    it('prioritizes instrumenting the handler specified on the config over the handler implied from the _HANDLER env var', async () => {
      initializeHandler('not-a-real-handler', {
        lambdaHandler: 'lambda-test/async.handler',
      });

      const otherEvent = {};
      const result = await lambdaRequire('lambda-test/async').handler(
        otherEvent,
        ctx
      );

      assert.strictEqual(result, 'ok');
      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(spans.length, 1);
      assertSpanSuccess(span);
      assert.strictEqual(span.parentSpanId, undefined);
    });
  });

  describe('url parsing', () => {
    it('pulls url from api gateway rest events', async () => {
      initializeHandler('lambda-test/sync.handler');
      const event = {
        path: '/lambda/test/path',
        headers: {
          Host: 'www.example.com',
          'X-Forwarded-Proto': 'http',
          'X-Forwarded-Port': 1234,
        },
        queryStringParameters: {
          key: 'value',
          key2: 'value2',
        },
      };

      await lambdaRequire('lambda-test/sync').handler(event, ctx, () => {});
      const [span] = memoryExporter.getFinishedSpans();
      assert.ok(
        span.attributes[ATTR_URL_FULL] ===
          'http://www.example.com:1234/lambda/test/path?key=value&key2=value2' ||
          span.attributes[ATTR_URL_FULL] ===
            'http://www.example.com:1234/lambda/test/path?key2=value2&key=value'
      );
    });
    it('pulls url from api gateway http events', async () => {
      initializeHandler('lambda-test/sync.handler');
      const event = {
        rawPath: '/lambda/test/path',
        headers: {
          host: 'www.example.com',
          'x-forwarded-proto': 'http',
          'x-forwarded-port': 1234,
        },
        queryStringParameters: {
          key: 'value',
        },
      };

      await lambdaRequire('lambda-test/sync').handler(event, ctx, () => {});
      const [span] = memoryExporter.getFinishedSpans();
      assert.strictEqual(
        span.attributes[ATTR_URL_FULL],
        'http://www.example.com:1234/lambda/test/path?key=value'
      );
    });
  });
});
