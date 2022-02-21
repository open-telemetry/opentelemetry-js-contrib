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

import * as api from '@opentelemetry/api';
import { isTracingSuppressed, suppressTracing } from '@opentelemetry/core';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { VERSION } from './version';
import {
  ASYNC_FUNCTIONS,
  PROMISE_FUNCTIONS,
  SYNC_FUNCTIONS,
} from './constants';
import type * as fs from 'fs';
import type { FMember, FPMember, FsInstrumentationConfig } from './types';

type FS = typeof fs;

const hasPromises = parseInt(process.versions.node.split('.')[0], 10) > 8;

export default class FsInstrumentation extends InstrumentationBase<FS> {
  constructor(protected override _config: FsInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-fs', VERSION, _config);
  }

  init(): InstrumentationNodeModuleDefinition<FS>[] {
    return [
      new InstrumentationNodeModuleDefinition<FS>(
        'fs',
        ['*'],
        (fs: FS) => {
          this._diag.debug('Applying patch for fs');
          if (hasPromises) {
            for (const fName of PROMISE_FUNCTIONS) {
              if (isWrapped(fs.promises[fName])) {
                this._unwrap(fs.promises, fName);
              }
              this._wrap(
                fs.promises,
                fName,
                <any>this._patchPromiseFunction.bind(this, fName)
              );
            }
          }
          for (const fName of ASYNC_FUNCTIONS) {
            if (isWrapped(fs[fName])) {
              this._unwrap(fs, fName);
            }
            this._wrap(
              fs,
              fName,
              <any>this._patchAsyncFunction.bind(this, fName)
            );
          }
          for (const fName of SYNC_FUNCTIONS) {
            if (isWrapped(fs[fName])) {
              this._unwrap(fs, fName);
            }
            this._wrap(
              fs,
              fName,
              <any>this._patchSyncFunction.bind(this, fName)
            );
          }
          return fs;
        },
        (fs: FS) => {
          if (fs === undefined) return;
          this._diag.debug('Removing patch for fs');
          if (hasPromises) {
            for (const fName of PROMISE_FUNCTIONS) {
              if (isWrapped(fs.promises[fName])) {
                this._unwrap(fs.promises, fName);
              }
            }
          }
          for (const fName of ASYNC_FUNCTIONS) {
            if (isWrapped(fs[fName])) {
              this._unwrap(fs, fName);
            }
          }
          for (const fName of SYNC_FUNCTIONS) {
            if (isWrapped(fs[fName])) {
              this._unwrap(fs, fName);
            }
          }
        }
      ),
    ];
  }

  protected _patchPromiseFunction<T extends (...args: any[]) => ReturnType<T>>(
    functionName: FPMember,
    original: T
  ): T {
    const instrumentation = this;
    return <any>async function (this: any, ...args: any[]) {
      if (isTracingSuppressed(api.context.active())) {
        // Performance optimization. Avoid creating additional contexts and spans
        // if we already know that the tracing is being suppressed.
        return original.apply(this, args);
      }
      const { createHook, endHook } =
        instrumentation.getConfig() as FsInstrumentationConfig;
      if (typeof createHook === 'function') {
        if (
          // promise and async variants get mixed here for the hooks
          createHook(functionName, {
            args: args,
          }) === false
        ) {
          // return original.apply(this, args);
          return api.context.with(
            suppressTracing(api.context.active()),
            original,
            this,
            ...args
          );
        }
      }

      const span = instrumentation.tracer.startSpan(
        `fs ${functionName}`
      ) as api.Span;
      try {
        // QUESTION: Should we immediately suppress all internal nested calls?
        const res = await api.context.with(
          api.trace.setSpan(api.context.active(), span),
          original,
          this,
          ...args
        );
        if (typeof endHook === 'function') {
          try {
            endHook(functionName, { args: args, span });
          } catch (e) {
            instrumentation._diag.error('caught endHook error', e);
          }
        }
        span.end();
        return res;
      } catch (err) {
        span.recordException(err);
        span.setStatus({
          message: err.message,
          code: api.SpanStatusCode.ERROR,
        });
        if (typeof endHook === 'function') {
          endHook(functionName, { args: args, span });
        }
        span.end();
        throw err;
      }
    };
  }

  protected _patchAsyncFunction<T extends (...args: any[]) => ReturnType<T>>(
    functionName: FMember,
    original: T
  ): T {
    const instrumentation = this;
    return <any>function (this: any, ...args: any[]) {
      if (isTracingSuppressed(api.context.active())) {
        // Performance optimization. Avoid creating additional contexts and spans
        // if we already know that the tracing is being suppressed.
        return original.apply(this, args);
      }
      const { createHook, endHook } =
        instrumentation.getConfig() as FsInstrumentationConfig;
      if (typeof createHook === 'function') {
        if (
          createHook(functionName, {
            args: args,
          }) === false
        ) {
          // return original.apply(this, arguments);
          return api.context.with(
            suppressTracing(api.context.active()),
            original,
            this,
            ...args
          );
        }
      }

      const lastIdx = args.length - 1;
      const cb = args[lastIdx];
      if (typeof cb === 'function') {
        const span = instrumentation.tracer.startSpan(
          `fs ${functionName}`
        ) as api.Span;

        // return to the context active during the call in the callback
        args[lastIdx] = api.context.bind(
          api.context.active(),
          function (this: unknown, err?: Error) {
            if (err) {
              span.recordException(err);
              span.setStatus({
                message: err.message,
                code: api.SpanStatusCode.ERROR,
              });
            }
            if (typeof endHook === 'function') {
              try {
                endHook(functionName, { args: arguments, span });
              } catch (e) {
                instrumentation._diag.error('caught endHook error', e);
              }
            }
            span.end();
            return cb.apply(this, arguments);
          }
        );

        try {
          return api.context.with(
            api.trace.setSpan(api.context.active(), span),
            original,
            this,
            ...args
          );
        } catch (err) {
          span.recordException(err);
          span.setStatus({
            message: err.message,
            code: api.SpanStatusCode.ERROR,
          });
          if (typeof endHook === 'function') {
            try {
              endHook(functionName, { args: args, span });
            } catch (e) {
              instrumentation._diag.error('caught endHook error', e);
            }
          }
          span.end();
          throw err;
        }
      } else {
        // TODO: what to do if we are pretty sure it's going to throw
        return original.apply(this, args);
      }
    };
  }

  protected _patchSyncFunction<T extends (...args: any[]) => ReturnType<T>>(
    functionName: FMember,
    original: T
  ): T {
    const instrumentation = this;
    return <any>function (this: any, ...args: any[]) {
      if (isTracingSuppressed(api.context.active())) {
        // Performance optimization. Avoid creating additional contexts and spans
        // if we already know that the tracing is being suppressed.
        return original.apply(this, args);
      }
      const { createHook, endHook } =
        instrumentation.getConfig() as FsInstrumentationConfig;
      if (typeof createHook === 'function') {
        if (
          createHook(functionName, {
            args: args,
          }) === false
        ) {
          // return original.apply(this, args);
          return api.context.with(
            suppressTracing(api.context.active()),
            original,
            this,
            ...args
          );
        }
      }

      const span = instrumentation.tracer.startSpan(
        `fs ${functionName}`
      ) as api.Span;
      try {
        // QUESTION: Should we immediately suppress all internal nested calls?
        const res = api.context.with(
          api.trace.setSpan(api.context.active(), span),
          original,
          this,
          ...args
        );
        if (typeof endHook === 'function') {
          try {
            endHook(functionName, { args: args, span });
          } catch (e) {
            instrumentation._diag.error('caught endHook error', e);
          }
        }
        span.end();
        return res;
      } catch (err) {
        span.recordException(err);
        span.setStatus({
          message: err.message,
          code: api.SpanStatusCode.ERROR,
        });
        if (typeof endHook === 'function') {
          endHook(functionName, { args: args, span });
        }
        span.end();
        throw err;
      }
    };
  }
}
