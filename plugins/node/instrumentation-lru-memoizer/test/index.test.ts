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
import LruMemoizerInstrumentation from '../src';
import { trace, context } from '@opentelemetry/api';
import * as expect from 'expect';

import { registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';

registerInstrumentationTesting(new LruMemoizerInstrumentation());

import * as memoizer from 'lru-memoizer';

type MemoizerTestCallback = (err: Error, result: string) => void;

describe('lru-memoizer instrumentation', () => {
  describe('async', () => {
    it('should invoke load callback with original context', done => {
      const testTracer = trace
        .getTracerProvider()
        .getTracer('lru-memoize-testing');

      let memoizerLoadCallback: MemoizerTestCallback;
      const memoizedFoo = memoizer({
        load: (_param: unknown, callback: MemoizerTestCallback) => {
          memoizerLoadCallback = callback;
        },
        hash: () => 'bar',
      } as any);

      testTracer.startActiveSpan('memoized invocation', () => {
        const firstSpanContext = context.active();
        memoizedFoo({ foo: 'bar' }, (err, res) => {
          expect(context.active()).toBe(firstSpanContext);
          done(err);
        });
      });

      // we invoke the callback from outside of the above span's context.
      // however, we expect that the callback is called with the context of the original invocation
      memoizerLoadCallback!(null as any, 'result');
    });

    it('should invoke callback with right context when serving 2 parallel async requestes', () => {
      const testTracer = trace
        .getTracerProvider()
        .getTracer('lru-memoize-testing');

      const ongoingMemoizerLoads: Function[] = [];

      const memoizedFoo = memoizer({
        load: (_param: unknown, callback: MemoizerTestCallback) => {
          // don't call the cb yet, first invoke another call,
          // to let it go into the internal "pendingLoad" queue
          ongoingMemoizerLoads.push(callback);
        },
        hash: () => 'bar',
      } as any);

      testTracer.startActiveSpan('first request', () => {
        const firstSpanContext = context.active();
        memoizedFoo({ foo: 'bar' }, (err, res) => {
          expect(context.active()).toBe(firstSpanContext);
        });
      });

      testTracer.startActiveSpan('second request', () => {
        const secondSpanContext = context.active();
        memoizedFoo({ foo: 'bar' }, (err, res) => {
          expect(context.active()).toBe(secondSpanContext);
        });
      });

      expect(ongoingMemoizerLoads.length).toBe(1);
      ongoingMemoizerLoads[0](null, 'result');
    });

    it('should not throw when last argument is not callback', () => {
      const memoizedFoo = memoizer({
        load: (callback: MemoizerTestCallback) => {
          return 'foo';
        },
        hash: () => 'bar',
      } as any);

      // this is not valid but we want to make sure it does not throw or act badly
      memoizedFoo({ foo: 'bar' }, null as any);
    });
  });

  describe('sync', () => {
    it('should not break sync memoizer', () => {
      const memoizedFoo = memoizer.sync({
        load: (_params: any) => 'foo',
        hash: () => 'bar',
      } as any);

      const res = memoizedFoo({ foo: 'bar' });
      expect(res).toMatch('foo');
    });

    it('should not break sync memoizer that return promise', done => {
      const testTracer = trace
        .getTracerProvider()
        .getTracer('lru-memoize-testing');

      const memoizedFoo = memoizer.sync({
        load: (_params: any) => Promise.resolve('foo'),
        hash: () => 'bar',
      } as any);

      testTracer.startActiveSpan('first request', () => {
        const memoizerInvokeContext = context.active();
        const res = memoizedFoo({ foo: 'bar' }) as Promise<string>;
        res.then(val => {
          expect(context.active()).toBe(memoizerInvokeContext);
          expect(val).toMatch('foo'); // make sure it still works after patch
          done();
        });
      });
    });
  });
});
