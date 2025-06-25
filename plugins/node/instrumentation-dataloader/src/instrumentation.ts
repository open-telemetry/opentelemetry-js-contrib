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
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import {
  trace,
  context,
  Link,
  SpanStatusCode,
  SpanKind,
} from '@opentelemetry/api';
import { DataloaderInstrumentationConfig } from './types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import type * as Dataloader from 'dataloader';

const MODULE_NAME = 'dataloader';

type DataloaderInternal = typeof Dataloader.prototype & {
  _batchLoadFn: Dataloader.BatchLoadFn<unknown, unknown>;
  _batch: { spanLinks?: Link[] } | null;
};

type LoadFn = (typeof Dataloader.prototype)['load'];
type LoadManyFn = (typeof Dataloader.prototype)['loadMany'];
type PrimeFn = (typeof Dataloader.prototype)['prime'];
type ClearFn = (typeof Dataloader.prototype)['clear'];
type ClearAllFn = (typeof Dataloader.prototype)['clearAll'];

export class DataloaderInstrumentation extends InstrumentationBase<DataloaderInstrumentationConfig> {
  constructor(config: DataloaderInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition(
        MODULE_NAME,
        ['>=2.0.0 <3'],
        dataloader => {
          this._patchLoad(dataloader.prototype);
          this._patchLoadMany(dataloader.prototype);
          this._patchPrime(dataloader.prototype);
          this._patchClear(dataloader.prototype);
          this._patchClearAll(dataloader.prototype);

          return this._getPatchedConstructor(dataloader);
        },
        dataloader => {
          ['load', 'loadMany', 'prime', 'clear', 'clearAll'].forEach(method => {
            if (isWrapped(dataloader.prototype[method])) {
              this._unwrap(dataloader.prototype, method);
            }
          });
        }
      ) as InstrumentationNodeModuleDefinition,
    ];
  }

  private shouldCreateSpans(): boolean {
    const config = this.getConfig();
    const hasParentSpan = trace.getSpan(context.active()) !== undefined;
    return hasParentSpan || !config.requireParentSpan;
  }

  private getSpanName(
    dataloader: DataloaderInternal,
    operation: 'load' | 'loadMany' | 'batch' | 'prime' | 'clear' | 'clearAll'
  ): string {
    const dataloaderName = dataloader.name;
    if (dataloaderName === undefined || dataloaderName === null) {
      return `${MODULE_NAME}.${operation}`;
    }

    return `${MODULE_NAME}.${operation} ${dataloaderName}`;
  }

  private _getPatchedConstructor(
    constructor: typeof Dataloader
  ): typeof Dataloader {
    const prototype = constructor.prototype;
    const instrumentation = this;

    function PatchedDataloader(
      ...args: ConstructorParameters<typeof constructor>
    ) {
      const inst = new constructor(...args) as DataloaderInternal;

      if (!instrumentation.isEnabled()) {
        return inst;
      }

      if (isWrapped(inst._batchLoadFn)) {
        instrumentation._unwrap(inst, '_batchLoadFn');
      }

      instrumentation._wrap(inst, '_batchLoadFn', original => {
        return function patchedBatchLoadFn(
          this: DataloaderInternal,
          ...args: Parameters<Dataloader.BatchLoadFn<unknown, unknown>>
        ) {
          if (
            !instrumentation.isEnabled() ||
            !instrumentation.shouldCreateSpans()
          ) {
            return original.call(this, ...args);
          }

          const parent = context.active();
          const span = instrumentation.tracer.startSpan(
            instrumentation.getSpanName(inst, 'batch'),
            { links: this._batch?.spanLinks as Link[] | undefined },
            parent
          );

          return context.with(trace.setSpan(parent, span), () => {
            return (original.apply(this, args) as Promise<unknown[]>)
              .then(value => {
                span.end();
                return value;
              })
              .catch(err => {
                span.recordException(err);
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: err.message,
                });
                span.end();
                throw err;
              });
          });
        };
      });

      return inst;
    }

    PatchedDataloader.prototype = prototype;
    return PatchedDataloader as unknown as typeof Dataloader;
  }

  private _patchLoad(proto: typeof Dataloader.prototype) {
    if (isWrapped(proto.load)) {
      this._unwrap(proto, 'load');
    }

    this._wrap(proto, 'load', this._getPatchedLoad.bind(this));
  }

  private _getPatchedLoad(original: LoadFn): LoadFn {
    const instrumentation = this;

    return function patchedLoad(
      this: DataloaderInternal,
      ...args: Parameters<typeof original>
    ) {
      if (!instrumentation.shouldCreateSpans()) {
        return original.call(this, ...args);
      }

      const parent = context.active();
      const span = instrumentation.tracer.startSpan(
        instrumentation.getSpanName(this, 'load'),
        { kind: SpanKind.CLIENT },
        parent
      );

      return context.with(trace.setSpan(parent, span), () => {
        const result = original
          .call(this, ...args)
          .then(value => {
            span.end();
            return value;
          })
          .catch(err => {
            span.recordException(err);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err.message,
            });
            span.end();
            throw err;
          });

        const loader = this as DataloaderInternal;

        if (loader._batch) {
          if (!loader._batch.spanLinks) {
            loader._batch.spanLinks = [];
          }

          loader._batch.spanLinks.push({ context: span.spanContext() } as Link);
        }

        return result;
      });
    };
  }

  private _patchLoadMany(proto: typeof Dataloader.prototype) {
    if (isWrapped(proto.loadMany)) {
      this._unwrap(proto, 'loadMany');
    }

    this._wrap(proto, 'loadMany', this._getPatchedLoadMany.bind(this));
  }

  private _getPatchedLoadMany(original: LoadManyFn): LoadManyFn {
    const instrumentation = this;

    return function patchedLoadMany(
      this: DataloaderInternal,
      ...args: Parameters<typeof original>
    ) {
      if (!instrumentation.shouldCreateSpans()) {
        return original.call(this, ...args);
      }

      const parent = context.active();
      const span = instrumentation.tracer.startSpan(
        instrumentation.getSpanName(this, 'loadMany'),
        { kind: SpanKind.CLIENT },
        parent
      );

      return context.with(trace.setSpan(parent, span), () => {
        // .loadMany never rejects, as errors from internal .load
        // calls are caught by dataloader lib
        return original.call(this, ...args).then(value => {
          span.end();
          return value;
        });
      });
    };
  }

  private _patchPrime(proto: typeof Dataloader.prototype) {
    if (isWrapped(proto.prime)) {
      this._unwrap(proto, 'prime');
    }

    this._wrap(proto, 'prime', this._getPatchedPrime.bind(this));
  }

  private _getPatchedPrime(original: PrimeFn): PrimeFn {
    const instrumentation = this;

    return function patchedPrime(
      this: DataloaderInternal,
      ...args: Parameters<typeof original>
    ) {
      if (!instrumentation.shouldCreateSpans()) {
        return original.call(this, ...args);
      }

      const parent = context.active();
      const span = instrumentation.tracer.startSpan(
        instrumentation.getSpanName(this, 'prime'),
        { kind: SpanKind.CLIENT },
        parent
      );

      const ret = context.with(trace.setSpan(parent, span), () => {
        return original.call(this, ...args);
      });

      span.end();

      return ret;
    };
  }

  private _patchClear(proto: typeof Dataloader.prototype) {
    if (isWrapped(proto.clear)) {
      this._unwrap(proto, 'clear');
    }

    this._wrap(proto, 'clear', this._getPatchedClear.bind(this));
  }

  private _getPatchedClear(original: ClearFn): ClearFn {
    const instrumentation = this;

    return function patchedClear(
      this: DataloaderInternal,
      ...args: Parameters<typeof original>
    ) {
      if (!instrumentation.shouldCreateSpans()) {
        return original.call(this, ...args);
      }

      const parent = context.active();
      const span = instrumentation.tracer.startSpan(
        instrumentation.getSpanName(this, 'clear'),
        { kind: SpanKind.CLIENT },
        parent
      );

      const ret = context.with(trace.setSpan(parent, span), () => {
        return original.call(this, ...args);
      });

      span.end();

      return ret;
    };
  }

  private _patchClearAll(proto: typeof Dataloader.prototype) {
    if (isWrapped(proto.clearAll)) {
      this._unwrap(proto, 'clearAll');
    }

    this._wrap(proto, 'clearAll', this._getPatchedClearAll.bind(this));
  }

  private _getPatchedClearAll(original: ClearAllFn): ClearAllFn {
    const instrumentation = this;

    return function patchedClearAll(
      this: DataloaderInternal,
      ...args: Parameters<typeof original>
    ) {
      if (!instrumentation.shouldCreateSpans()) {
        return original.call(this, ...args);
      }

      const parent = context.active();
      const span = instrumentation.tracer.startSpan(
        instrumentation.getSpanName(this, 'clearAll'),
        { kind: SpanKind.CLIENT },
        parent
      );

      const ret = context.with(trace.setSpan(parent, span), () => {
        return original.call(this, ...args);
      });

      span.end();

      return ret;
    };
  }
}
