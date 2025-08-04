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
  AWS_HANDLER_STREAMING_RESPONSE,
  AWS_HANDLER_STREAMING_SYMBOL,
} from '../../src/instrumentation';
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
  ATTR_EXCEPTION_MESSAGE,
} from '@opentelemetry/semantic-conventions';
import { ATTR_FAAS_COLDSTART, ATTR_FAAS_NAME } from '../../src/semconv';
import { ATTR_FAAS_EXECUTION } from '../../src/semconv-obsolete';
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
  assert.strictEqual(span.attributes[ATTR_FAAS_EXECUTION], 'aws_request_id');
  assert.strictEqual(span.attributes['faas.id'], 'my_arn');
  assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
  assert.strictEqual(span.status.message, undefined);
};

const assertSpanFailure = (span: ReadableSpan) => {
  assert.strictEqual(span.kind, SpanKind.SERVER);
  assert.strictEqual(span.name, 'my_function');
  assert.strictEqual(span.attributes[ATTR_FAAS_EXECUTION], 'aws_request_id');
  assert.strictEqual(span.attributes['faas.id'], 'my_arn');
  assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
  assert.strictEqual(span.status.message, 'handler error');
  assert.strictEqual(span.events.length, 1);
  assert.strictEqual(
    span.events[0].attributes![ATTR_EXCEPTION_MESSAGE],
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

    const provider = new NodeTracerProvider({
      spanProcessors: [new BatchSpanProcessor(memoryExporter)],
    });
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
      assert.strictEqual(span.parentSpanContext?.spanId, undefined);
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
      assert.strictEqual(span.parentSpanContext?.spanId, undefined);
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
      assert.strictEqual(span.parentSpanContext?.spanId, undefined);
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
      assert.strictEqual(span.parentSpanContext?.spanId, undefined);
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
      assert.strictEqual(span1.parentSpanContext?.spanId, undefined);
      assert.strictEqual(span1.attributes[ATTR_FAAS_COLDSTART], true);

      assert.strictEqual(result2, 'ok');
      assertSpanSuccess(span2);
      assert.strictEqual(span2.parentSpanContext?.spanId, undefined);
      assert.strictEqual(span2.attributes[ATTR_FAAS_COLDSTART], false);
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
      assert.strictEqual(span.parentSpanContext?.spanId, undefined);
      assert.strictEqual(span.attributes[ATTR_FAAS_COLDSTART], false);
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
      assert.strictEqual(span.parentSpanContext?.spanId, undefined);
      assert.strictEqual(span.attributes[ATTR_FAAS_COLDSTART], false);
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
      assert.strictEqual(span.parentSpanContext?.spanId, undefined);
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
      assert.strictEqual(span.parentSpanContext?.spanId, undefined);
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
      assert.strictEqual(span.parentSpanContext?.spanId, undefined);
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
    assert.strictEqual(span.parentSpanContext?.spanId, undefined);
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
      assert.equal(
        spans[0].parentSpanContext?.spanId,
        sampledAwsSpanContext.spanId
      );
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
      assert.equal(
        spans[0].parentSpanContext?.spanId,
        sampledAwsSpanContext.spanId
      );
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
      assert.strictEqual(
        span.parentSpanContext?.spanId,
        sampledAwsSpanContext.spanId
      );
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
      assert.strictEqual(span.parentSpanContext?.spanId, undefined);
    });
  });

  describe('hooks', () => {
    describe('requestHook', () => {
      it('sync - success', async () => {
        initializeHandler('lambda-test/async.handler', {
          requestHook: (span, { context }) => {
            span.setAttribute(ATTR_FAAS_NAME, context.functionName);
          },
        });

        await lambdaRequire('lambda-test/async').handler('arg', ctx);
        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(span.attributes[ATTR_FAAS_NAME], ctx.functionName);
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
        assert.strictEqual(span.parentSpanContext?.spanId, undefined);
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
      assert.strictEqual(span.parentSpanContext?.spanId, undefined);
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

  describe('streaming handlers', () => {
    const createMockResponseStream = () => ({
      write: () => {},
      end: () => {},
    });

    describe('async streaming handler success', () => {
      it('should export a valid span', async () => {
        initializeHandler('lambda-test/streaming.handler');

        const responseStream = createMockResponseStream();
        const result = await lambdaRequire('lambda-test/streaming').handler(
          'arg',
          responseStream,
          ctx
        );
        assert.strictEqual(result, 'stream-ok');

        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assert.strictEqual(spans.length, 1);
        assertSpanSuccess(span);
        assert.strictEqual(span.parentSpanContext?.spanId, undefined);
      });

      it('should record coldstart for streaming handlers', async () => {
        initializeHandler('lambda-test/streaming.handler');

        const handlerModule = lambdaRequire('lambda-test/streaming');
        const responseStream1 = createMockResponseStream();
        const responseStream2 = createMockResponseStream();

        const result1 = await handlerModule.handler(
          'arg',
          responseStream1,
          ctx
        );
        const result2 = await handlerModule.handler(
          'arg',
          responseStream2,
          ctx
        );

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 2);
        const [span1, span2] = spans;

        assert.strictEqual(result1, 'stream-ok');
        assertSpanSuccess(span1);
        assert.strictEqual(span1.parentSpanContext?.spanId, undefined);
        assert.strictEqual(span1.attributes[SEMATTRS_FAAS_COLDSTART], true);

        assert.strictEqual(result2, 'stream-ok');
        assertSpanSuccess(span2);
        assert.strictEqual(span2.parentSpanContext?.spanId, undefined);
        assert.strictEqual(span2.attributes[SEMATTRS_FAAS_COLDSTART], false);
      });

      it('context should have parent trace', async () => {
        initializeHandler('lambda-test/streaming.context');

        const responseStream = createMockResponseStream();
        const result = await lambdaRequire('lambda-test/streaming').context(
          'arg',
          responseStream,
          ctx
        );

        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assert.strictEqual(span.spanContext().traceId, result);
      });
    });

    describe('streaming handler errors', () => {
      it('should record error', async () => {
        initializeHandler('lambda-test/streaming.error');

        let err: Error;
        try {
          const responseStream = createMockResponseStream();
          await lambdaRequire('lambda-test/streaming').error(
            'arg',
            responseStream,
            ctx
          );
        } catch (e: any) {
          err = e;
        }
        assert.strictEqual(err!.message, 'handler error');

        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assert.strictEqual(spans.length, 1);
        assertSpanFailure(span);
        assert.strictEqual(span.parentSpanContext?.spanId, undefined);
      });

      it('should record string error', async () => {
        initializeHandler('lambda-test/streaming.stringerror');

        let err: string;
        try {
          const responseStream = createMockResponseStream();
          await lambdaRequire('lambda-test/streaming').stringerror(
            'arg',
            responseStream,
            ctx
          );
        } catch (e: any) {
          err = e;
        }
        assert.strictEqual(err!, 'handler error');

        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assertSpanFailure(span);
        assert.strictEqual(span.parentSpanContext?.spanId, undefined);
      });

      it('should record error after writing to stream', async () => {
        initializeHandler('lambda-test/streaming.errorAfterWrite');

        let err: Error;
        try {
          const responseStream = createMockResponseStream();
          await lambdaRequire('lambda-test/streaming').errorAfterWrite(
            'arg',
            responseStream,
            ctx
          );
        } catch (e: any) {
          err = e;
        }
        assert.strictEqual(err!.message, 'handler error after write');
        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
        assert.strictEqual(span.status.message, 'handler error after write');
      });

      it('should record promise rejection error', async () => {
        initializeHandler('lambda-test/streaming.promiseReject');

        let err: Error;
        try {
          const responseStream = createMockResponseStream();
          await lambdaRequire('lambda-test/streaming').promiseReject(
            'arg',
            responseStream,
            ctx
          );
        } catch (e: any) {
          err = e;
        }
        assert.strictEqual(err!.message, 'promise rejection error');
        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
        assert.strictEqual(span.status.message, 'promise rejection error');
      });
    });

    describe('sync streaming handler', () => {
      it('should export a valid span for sync streaming handler', async () => {
        initializeHandler('lambda-test/streaming.syncHandler');

        const responseStream = createMockResponseStream();
        const result = await lambdaRequire('lambda-test/streaming').syncHandler(
          'arg',
          responseStream,
          ctx
        );
        assert.strictEqual(result, 'sync-ok');

        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assert.strictEqual(spans.length, 1);
        assertSpanSuccess(span);
        assert.strictEqual(span.parentSpanContext?.spanId, undefined);
      });
    });

    describe('streaming handler with remote parent', () => {
      beforeEach(() => {
        propagation.disable();
      });

      it('uses globally registered propagator with streaming handler', async () => {
        propagation.setGlobalPropagator(new AWSXRayPropagator());
        initializeHandler('lambda-test/streaming.handler');

        const proxyEvent = {
          headers: {
            'x-amzn-trace-id': sampledAwsHeader,
          },
        };

        const responseStream = createMockResponseStream();
        const result = await lambdaRequire('lambda-test/streaming').handler(
          proxyEvent,
          responseStream,
          ctx
        );
        assert.strictEqual(result, 'stream-ok');

        const spans = memoryExporter.getFinishedSpans();

        assert.strictEqual(spans.length, 1);
        assert.equal(
          spans[0].spanContext().traceId,
          sampledAwsSpanContext.traceId
        );
        assert.equal(
          spans[0].parentSpanContext?.spanId,
          sampledAwsSpanContext.spanId
        );
      });

      it('uses custom eventContextExtractor with streaming handler', async () => {
        propagation.setGlobalPropagator(new W3CTraceContextPropagator());
        const customExtractor = (event: any): OtelContext => {
          const propagator = new AWSXRayPropagator();
          return propagator.extract(
            context.active(),
            event.contextCarrier,
            defaultTextMapGetter
          );
        };

        initializeHandler('lambda-test/streaming.handler', {
          eventContextExtractor: customExtractor,
        });

        const otherEvent = {
          contextCarrier: {
            traceparent: sampledGenericSpan,
            'x-amzn-trace-id': sampledAwsHeader,
          },
        };

        const responseStream = createMockResponseStream();
        const result = await lambdaRequire('lambda-test/streaming').handler(
          otherEvent,
          responseStream,
          ctx
        );

        assert.strictEqual(result, 'stream-ok');

        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assert.strictEqual(spans.length, 1);
        assertSpanSuccess(span);
        assert.strictEqual(
          span.spanContext().traceId,
          sampledAwsSpanContext.traceId
        );
        assert.strictEqual(
          span.parentSpanContext?.spanId,
          sampledAwsSpanContext.spanId
        );
      });
    });

    describe('streaming handler hooks', () => {
      describe('requestHook with streaming', () => {
        it('should apply requestHook to streaming handler', async () => {
          initializeHandler('lambda-test/streaming.handler', {
            requestHook: (span, { context }) => {
              span.setAttribute(SEMRESATTRS_FAAS_NAME, context.functionName);
            },
          });

          const responseStream = createMockResponseStream();
          await lambdaRequire('lambda-test/streaming').handler(
            'arg',
            responseStream,
            ctx
          );

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

      describe('responseHook with streaming', () => {
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

        it('streaming - success', async () => {
          initializeHandler('lambda-test/streaming.handler', config);

          const responseStream = createMockResponseStream();
          const res = await lambdaRequire('lambda-test/streaming').handler(
            'arg',
            responseStream,
            ctx
          );

          const [span] = memoryExporter.getFinishedSpans();
          assert.strictEqual(span.attributes[RES_ATTR], res);
        });

        it('streaming - error', async () => {
          initializeHandler('lambda-test/streaming.error', config);

          let err: Error;
          try {
            const responseStream = createMockResponseStream();
            await lambdaRequire('lambda-test/streaming').error(
              'arg',
              responseStream,
              ctx
            );
          } catch (e: any) {
            err = e;
          }
          const [span] = memoryExporter.getFinishedSpans();
          assert.strictEqual(span.attributes[ERR_ATTR], err!.message);
        });

        it('streaming - string error', async () => {
          initializeHandler('lambda-test/streaming.stringerror', config);

          let err: string;
          try {
            const responseStream = createMockResponseStream();
            await lambdaRequire('lambda-test/streaming').stringerror(
              'arg',
              responseStream,
              ctx
            );
          } catch (e: any) {
            err = e;
          }
          const [span] = memoryExporter.getFinishedSpans();
          assert.strictEqual(span.attributes[ERR_ATTR], err!);
        });
      });
    });

    describe('symbol preservation', () => {
      it('should preserve AWS_HANDLER_STREAMING_SYMBOL on streaming handlers', async () => {
        initializeHandler('lambda-test/streaming.handler');

        const handlerModule = lambdaRequire('lambda-test/streaming');
        const handler = handlerModule.handler;

        assert.strictEqual(
          handler[AWS_HANDLER_STREAMING_SYMBOL],
          AWS_HANDLER_STREAMING_RESPONSE,
          'AWS_HANDLER_STREAMING_SYMBOL should be preserved after instrumentation'
        );
      });

      it('should preserve high water mark symbol on streaming handlers', async () => {
        initializeHandler(
          'lambda-test/streaming.handlerWithCustomHighWaterMark'
        );

        const handlerModule = lambdaRequire('lambda-test/streaming');
        const handler = handlerModule.handlerWithCustomHighWaterMark;

        assert.strictEqual(
          handler[handlerModule.HIGH_WATER_MARK_SYMBOL],
          32768,
          'highWaterMark symbol should be preserved after instrumentation'
        );
      });
    });
  });
});
