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
import { promisify } from 'util';
import { indexFs } from './utils';

type FS = typeof fs;
type FSPromises = (typeof fs)['promises'];

/**
 * This is important for 2-level functions like `realpath.native` to retain the 2nd-level
 * when patching the 1st-level.
 */
function patchedFunctionWithOriginalProperties<
  T extends (...args: any[]) => ReturnType<T>
>(patchedFunction: T, original: T): T {
  return Object.assign(patchedFunction, original);
}

export default class FsInstrumentation extends InstrumentationBase<FS> {
  constructor(config?: FsInstrumentationConfig) {
    super('@opentelemetry/instrumentation-fs', VERSION, config);
  }

  init(): (
    | InstrumentationNodeModuleDefinition<FS>
    | InstrumentationNodeModuleDefinition<FSPromises>
  )[] {
    return [
      new InstrumentationNodeModuleDefinition<FS>(
        'fs',
        ['*'],
        (fs: FS) => {
          this._diag.debug('Applying patch for fs');
          for (const fName of SYNC_FUNCTIONS) {
            const { objectToPatch, functionNameToPatch } = indexFs(fs, fName);

            if (isWrapped(objectToPatch[functionNameToPatch])) {
              this._unwrap(objectToPatch, functionNameToPatch);
            }
            this._wrap(
              objectToPatch,
              functionNameToPatch,
              <any>this._patchSyncFunction.bind(this, fName)
            );
          }
          for (const fName of CALLBACK_FUNCTIONS) {
            const { objectToPatch, functionNameToPatch } = indexFs(fs, fName);
            if (isWrapped(objectToPatch[functionNameToPatch])) {
              this._unwrap(objectToPatch, functionNameToPatch);
            }
            if (fName === 'exists') {
              // handling separately because of the inconsistent cb style:
              // `exists` doesn't have error as the first argument, but the result
              this._wrap(
                objectToPatch,
                functionNameToPatch,
                <any>this._patchExistsCallbackFunction.bind(this, fName)
              );
              continue;
            }
            this._wrap(
              objectToPatch,
              functionNameToPatch,
              <any>this._patchCallbackFunction.bind(this, fName)
            );
          }
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
          return fs;
        },
        (fs: FS) => {
          if (fs === undefined) return;
          this._diag.debug('Removing patch for fs');
          for (const fName of SYNC_FUNCTIONS) {
            const { objectToPatch, functionNameToPatch } = indexFs(fs, fName);
            if (isWrapped(objectToPatch[functionNameToPatch])) {
              this._unwrap(objectToPatch, functionNameToPatch);
            }
          }
          for (const fName of CALLBACK_FUNCTIONS) {
            const { objectToPatch, functionNameToPatch } = indexFs(fs, fName);
            if (isWrapped(objectToPatch[functionNameToPatch])) {
              this._unwrap(objectToPatch, functionNameToPatch);
            }
          }
          for (const fName of PROMISE_FUNCTIONS) {
            if (isWrapped(fs.promises[fName])) {
              this._unwrap(fs.promises, fName);
            }
          }
        }
      ),
      new InstrumentationNodeModuleDefinition<FSPromises>(
        'fs/promises',
        ['*'],
        (fsPromises: FSPromises) => {
          this._diag.debug('Applying patch for fs/promises');
          for (const fName of PROMISE_FUNCTIONS) {
            if (isWrapped(fsPromises[fName])) {
              this._unwrap(fsPromises, fName);
            }
            this._wrap(
              fsPromises,
              fName,
              <any>this._patchPromiseFunction.bind(this, fName)
            );
          }
          return fsPromises;
        },
        (fsPromises: FSPromises) => {
          if (fsPromises === undefined) return;
          this._diag.debug('Removing patch for fs/promises');
          for (const fName of PROMISE_FUNCTIONS) {
            if (isWrapped(fsPromises[fName])) {
              this._unwrap(fsPromises, fName);
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
    const patchedFunction = <any>function (this: any, ...args: any[]) {
      const activeContext = api.context.active();

      if (!instrumentation._shouldTrace(activeContext)) {
        return original.apply(this, args);
      }
      if (
        instrumentation._runCreateHook(functionName, {
          args: args,
        }) === false
      ) {
        return api.context.with(
          suppressTracing(activeContext),
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
          suppressTracing(api.trace.setSpan(activeContext, span)),
          original,
          this,
          ...args
        );
        instrumentation._runEndHook(functionName, { args: args, span });
        return res;
      } catch (error: any) {
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
    return patchedFunctionWithOriginalProperties(patchedFunction, original);
  }

  protected _patchCallbackFunction<T extends (...args: any[]) => ReturnType<T>>(
    functionName: FMember,
    original: T
  ): T {
    const instrumentation = this;
    const patchedFunction = <any>function (this: any, ...args: any[]) {
      const activeContext = api.context.active();

      if (!instrumentation._shouldTrace(activeContext)) {
        return original.apply(this, args);
      }
      if (
        instrumentation._runCreateHook(functionName, {
          args: args,
        }) === false
      ) {
        return api.context.with(
          suppressTracing(activeContext),
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
          activeContext,
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
            suppressTracing(api.trace.setSpan(activeContext, span)),
            original,
            this,
            ...args
          );
        } catch (error: any) {
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
    return patchedFunctionWithOriginalProperties(patchedFunction, original);
  }

  protected _patchExistsCallbackFunction<
    T extends (...args: any[]) => ReturnType<T>
  >(functionName: 'exists', original: T): T {
    const instrumentation = this;
    const patchedFunction = <any>function (this: any, ...args: any[]) {
      const activeContext = api.context.active();

      if (!instrumentation._shouldTrace(activeContext)) {
        return original.apply(this, args);
      }
      if (
        instrumentation._runCreateHook(functionName, {
          args: args,
        }) === false
      ) {
        return api.context.with(
          suppressTracing(activeContext),
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
          activeContext,
          function (this: unknown) {
            // `exists` never calls the callback with an error
            instrumentation._runEndHook(functionName, {
              args: args,
              span,
            });
            span.end();
            return cb.apply(this, arguments);
          }
        );

        try {
          // Suppress tracing for internal fs calls
          return api.context.with(
            suppressTracing(api.trace.setSpan(activeContext, span)),
            original,
            this,
            ...args
          );
        } catch (error: any) {
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
        return original.apply(this, args);
      }
    };
    const functionWithOriginalProperties =
      patchedFunctionWithOriginalProperties(patchedFunction, original);

    // `exists` has a custom promisify function because of the inconsistent signature
    // replicating that on the patched function
    const promisified = function (path: unknown) {
      return new Promise(resolve =>
        functionWithOriginalProperties(path, resolve)
      );
    };
    Object.defineProperty(promisified, 'name', { value: functionName });
    Object.defineProperty(functionWithOriginalProperties, promisify.custom, {
      value: promisified,
    });

    return functionWithOriginalProperties;
  }

  protected _patchPromiseFunction<T extends (...args: any[]) => ReturnType<T>>(
    functionName: FPMember,
    original: T
  ): T {
    const instrumentation = this;
    const patchedFunction = <any>async function (this: any, ...args: any[]) {
      const activeContext = api.context.active();

      if (!instrumentation._shouldTrace(activeContext)) {
        return original.apply(this, args);
      }
      if (
        instrumentation._runCreateHook(functionName, {
          args: args,
        }) === false
      ) {
        return api.context.with(
          suppressTracing(activeContext),
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
          suppressTracing(api.trace.setSpan(activeContext, span)),
          original,
          this,
          ...args
        );
        instrumentation._runEndHook(functionName, { args: args, span });
        return res;
      } catch (error: any) {
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
    return patchedFunctionWithOriginalProperties(patchedFunction, original);
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

  protected _shouldTrace(context: api.Context): boolean {
    if (isTracingSuppressed(context)) {
      // Performance optimization. Avoid creating additional contexts and spans
      // if we already know that the tracing is being suppressed.
      return false;
    }

    const { requireParentSpan } = this.getConfig() as FsInstrumentationConfig;
    if (requireParentSpan) {
      const parentSpan = api.trace.getSpan(context);
      if (parentSpan == null) {
        return false;
      }
    }

    return true;
  }
}
