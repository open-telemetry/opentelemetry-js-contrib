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
  CALLBACK_FUNCTIONS,
  PROMISE_FUNCTIONS,
  SYNC_FUNCTIONS,
} from './constants';
import type * as fs from 'fs';
import type {
  FMember,
  FPMember,
  CreateHook,
  EndHook,
  FsInstrumentationConfig,
} from './types';

type FS = typeof fs;

const supportsPromises = parseInt(process.versions.node.split('.')[0], 10) > 8;

export default class FsInstrumentation extends InstrumentationBase<FS> {
  constructor(config?: FsInstrumentationConfig) {
    super('@opentelemetry/instrumentation-fs', VERSION, config);
  }

  init(): InstrumentationNodeModuleDefinition<FS>[] {
    return [
      new InstrumentationNodeModuleDefinition<FS>(
        'fs',
        ['*'],
        (fs: FS) => {
          this._diag.debug('Applying patch for fs');
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
          for (const fName of CALLBACK_FUNCTIONS) {
            if (isWrapped(fs[fName])) {
              this._unwrap(fs, fName);
            }
            this._wrap(
              fs,
              fName,
              <any>this._patchCallbackFunction.bind(this, fName)
            );
          }
          if (supportsPromises) {
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
          return fs;
        },
        (fs: FS) => {
          if (fs === undefined) return;
          this._diag.debug('Removing patch for fs');
          for (const fName of SYNC_FUNCTIONS) {
            if (isWrapped(fs[fName])) {
              this._unwrap(fs, fName);
            }
          }
          for (const fName of CALLBACK_FUNCTIONS) {
            if (isWrapped(fs[fName])) {
              this._unwrap(fs, fName);
            }
          }
          if (supportsPromises) {
            for (const fName of PROMISE_FUNCTIONS) {
              if (isWrapped(fs.promises[fName])) {
                this._unwrap(fs.promises, fName);
              }
            }
          }
        }
      ),
    ];
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
      if (
        instrumentation._runCreateHook(functionName, {
          args: args,
        }) === false
      ) {
        return api.context.with(
          suppressTracing(api.context.active()),
          original,
          this,
          ...args
        );
      }

      const span = instrumentation.tracer.startSpan(
        `fs ${functionName}`
      ) as api.Span;

      try {
        // Suppress tracing for internal fs calls
        const res = api.context.with(
          suppressTracing(api.trace.setSpan(api.context.active(), span)),
          original,
          this,
          ...args
        );
        instrumentation._runEndHook(functionName, { args: args, span });
        return res;
      } catch (error) {
        span.recordException(error);
        span.setStatus({
          message: error.message,
          code: api.SpanStatusCode.ERROR,
        });
        instrumentation._runEndHook(functionName, { args: args, span, error });
        throw error;
      } finally {
        span.end();
      }
    };
  }

  protected _patchCallbackFunction<T extends (...args: any[]) => ReturnType<T>>(
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
      if (
        instrumentation._runCreateHook(functionName, {
          args: args,
        }) === false
      ) {
        return api.context.with(
          suppressTracing(api.context.active()),
          original,
          this,
          ...args
        );
      }

      const lastIdx = args.length - 1;
      const cb = args[lastIdx];
      if (typeof cb === 'function') {
        const span = instrumentation.tracer.startSpan(
          `fs ${functionName}`
        ) as api.Span;

        // Return to the context active during the call in the callback
        args[lastIdx] = api.context.bind(
          api.context.active(),
          function (this: unknown, error?: Error) {
            if (error) {
              span.recordException(error);
              span.setStatus({
                message: error.message,
                code: api.SpanStatusCode.ERROR,
              });
            }
            instrumentation._runEndHook(functionName, {
              args: args,
              span,
              error,
            });
            span.end();
            return cb.apply(this, arguments);
          }
        );

        try {
          // Suppress tracing for internal fs calls
          return api.context.with(
            suppressTracing(api.trace.setSpan(api.context.active(), span)),
            original,
            this,
            ...args
          );
        } catch (error) {
          span.recordException(error);
          span.setStatus({
            message: error.message,
            code: api.SpanStatusCode.ERROR,
          });
          instrumentation._runEndHook(functionName, {
            args: args,
            span,
            error,
          });
          span.end();
          throw error;
        }
      } else {
        // TODO: what to do if we are pretty sure it's going to throw
        return original.apply(this, args);
      }
    };
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
      if (
        instrumentation._runCreateHook(functionName, {
          args: args,
        }) === false
      ) {
        return api.context.with(
          suppressTracing(api.context.active()),
          original,
          this,
          ...args
        );
      }

      const span = instrumentation.tracer.startSpan(
        `fs ${functionName}`
      ) as api.Span;

      try {
        // Suppress tracing for internal fs calls
        const res = await api.context.with(
          suppressTracing(api.trace.setSpan(api.context.active(), span)),
          original,
          this,
          ...args
        );
        instrumentation._runEndHook(functionName, { args: args, span });
        return res;
      } catch (error) {
        span.recordException(error);
        span.setStatus({
          message: error.message,
          code: api.SpanStatusCode.ERROR,
        });
        instrumentation._runEndHook(functionName, { args: args, span, error });
        throw error;
      } finally {
        span.end();
      }
    };
  }

  protected _runCreateHook(
    ...args: Parameters<CreateHook>
  ): ReturnType<CreateHook> {
    const { createHook } = this.getConfig() as FsInstrumentationConfig;
    if (typeof createHook === 'function') {
      try {
        return createHook(...args);
      } catch (e) {
        this._diag.error('caught createHook error', e);
      }
    }
    return true;
  }

  protected _runEndHook(...args: Parameters<EndHook>): ReturnType<EndHook> {
    const { endHook } = this.getConfig() as FsInstrumentationConfig;
    if (typeof endHook === 'function') {
      try {
        endHook(...args);
      } catch (e) {
        this._diag.error('caught endHook error', e);
      }
    }
  }
}
