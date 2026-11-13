/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { context, trace, SpanStatusCode } = require('@opentelemetry/api');
const {
  AsyncLocalStorageContextManager,
} = require('@opentelemetry/context-async-hooks');
const {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} = require('@opentelemetry/sdk-trace');
const { map } = require('rxjs/operators');
const { version } = JSON.parse(
  readFileSync(
    join(dirname(require.resolve('@nestjs/core')), 'package.json'),
    'utf8'
  )
);

exports.run = async (NestInstrumentation, loadNest) => {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter })],
  });
  context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable()
  );
  const instrumentation = new NestInstrumentation();
  instrumentation.setTracerProvider(provider);
  const tracer = provider.getTracer('application');
  let app;
  try {
    const { core, common, platform } = await loadNest();
    let guardCalls = 0;
    let interceptorCalls = 0;
    class LoadingController {
      async success() {
        const active = trace.getSpan(context.active());
        await Promise.resolve();
        assert.equal(trace.getSpan(context.active()), active);
        const child = tracer.startSpan('application work');
        child.end();
        return 'hello';
      }

      async failure() {
        await Promise.resolve();
        throw new Error('async controller error');
      }
    }
    for (const [method, path] of [
      ['success', 'items/:id'],
      ['failure', 'error'],
    ]) {
      const descriptor = Object.getOwnPropertyDescriptor(
        LoadingController.prototype,
        method
      );
      common.Get(path)(LoadingController.prototype, method, descriptor);
      common.SetMetadata('fixture', 'preserved')(
        LoadingController.prototype,
        method,
        descriptor
      );
    }
    common.Controller('loading')(LoadingController);
    common.UseGuards({
      canActivate(executionContext) {
        assert.equal(
          Reflect.getMetadata('fixture', executionContext.getHandler()),
          'preserved'
        );
        guardCalls++;
        return true;
      },
    })(LoadingController);
    common.UseInterceptors({
      intercept(executionContext, next) {
        assert.equal(
          Reflect.getMetadata('fixture', executionContext.getHandler()),
          'preserved'
        );
        interceptorCalls++;
        return next.handle().pipe(map(value => value.toUpperCase()));
      },
    })(LoadingController);
    class LoadingModule {}
    common.Module({ controllers: [LoadingController] })(LoadingModule);

    // Routes retain their wrappers, so each lifecycle phase creates a new app.
    for (const enabled of [true, false, true]) {
      for (let repeat = 0; repeat < 2; repeat++) {
        if (enabled) instrumentation.enable();
        else instrumentation.disable();
      }
      guardCalls = interceptorCalls = 0;
      app = await core.NestFactory.create(
        LoadingModule,
        new platform.ExpressAdapter(),
        { logger: false, abortOnError: false }
      );
      await app.listen(0, '127.0.0.1');
      const address = await app.getUrl();
      const response = await fetch(`${address}/loading/items/42`);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'HELLO');
      const failure = await fetch(`${address}/loading/error`);
      assert.equal(failure.status, 500);
      assert.deepEqual(await failure.json(), {
        statusCode: 500,
        message: 'Internal server error',
      });
      assert.equal(guardCalls, 2);
      assert.equal(interceptorCalls, 2);

      const spans = exporter.getFinishedSpans();
      const nestSpans = spans.filter(
        span =>
          span.instrumentationScope.name ===
          '@opentelemetry/instrumentation-nestjs-core'
      );
      assert.equal(nestSpans.length, enabled ? 5 : 0);
      if (enabled) {
        const findSpan = name => {
          const matching = spans.filter(span => span.name === name);
          assert.equal(matching.length, 1, `Expected one span named ${name}`);
          return matching[0];
        };
        const creation = findSpan('Create Nest App');
        assert.equal(creation.attributes['nestjs.module'], 'LoadingModule');
        assert.equal(creation.attributes['nestjs.type'], 'app_creation');
        for (const span of nestSpans) {
          assert.equal(span.attributes.component, '@nestjs/core');
          assert.equal(span.attributes['nestjs.version'], version);
        }
        for (const method of ['success', 'failure']) {
          const request = findSpan(`LoadingController.${method}`);
          const handler = findSpan(method);
          assert.equal(request.attributes['nestjs.type'], 'request_context');
          assert.equal(
            request.attributes['nestjs.controller'],
            'LoadingController'
          );
          assert.equal(request.attributes['http.request.method'], 'GET');
          assert.equal(request.attributes['nestjs.callback'], method);
          assert.equal(handler.attributes['nestjs.type'], 'handler');
          assert.equal(
            handler.parentSpanContext.spanId,
            request.spanContext().spanId
          );
          assert.equal(
            handler.spanContext().traceId,
            request.spanContext().traceId
          );
          if (method === 'success') {
            assert.equal(
              request.attributes['http.route'],
              '/loading/items/:id'
            );
            assert.equal(request.attributes['url.full'], '/loading/items/42');
            const child = findSpan('application work');
            assert.equal(
              child.parentSpanContext.spanId,
              handler.spanContext().spanId
            );
            assert.equal(
              child.spanContext().traceId,
              handler.spanContext().traceId
            );
            assert.equal(handler.status.code, SpanStatusCode.UNSET);
            assert.equal(request.status.code, SpanStatusCode.UNSET);
          } else {
            for (const span of [request, handler]) {
              assert.equal(span.status.code, SpanStatusCode.ERROR);
              assert.equal(span.status.message, 'async controller error');
              assert.equal(span.events.length, 1);
              assert.equal(span.events[0].name, 'exception');
              assert.equal(
                span.events[0].attributes['exception.message'],
                'async controller error'
              );
            }
          }
        }
      }
      await app.close();
      app = undefined;
      exporter.reset();
    }
  } finally {
    if (app) await app.close();
    instrumentation.disable();
    context.disable();
    await provider.shutdown();
  }
};
