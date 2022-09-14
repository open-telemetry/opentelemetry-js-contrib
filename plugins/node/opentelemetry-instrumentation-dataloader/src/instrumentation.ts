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
} from "@opentelemetry/instrumentation";
import {
  diag,
  trace,
  context,
  Link,
  SpanStatusCode,
  SpanKind,
} from "@opentelemetry/api";
import { DataloaderInstrumentationConfig } from "./types";
import { VERSION } from "./version";
import * as Dataloader from "dataloader";

const MODULE_NAME = "dataloader";

type DataloaderInternal = typeof Dataloader.prototype & {
  _batchLoadFn: Dataloader.BatchLoadFn<unknown, unknown>;
  _batch: { _spanLinks?: Link[] } | null;
};

type LoadFn = typeof Dataloader.prototype["load"];
type LoadManyFn = typeof Dataloader.prototype["loadMany"];

export class DataloaderInstrumentation extends InstrumentationBase<
  typeof Dataloader
> {
  constructor(config: DataloaderInstrumentationConfig = {}) {
    super("@opentelemetry/instrumentation-dataloader", VERSION, config);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition<typeof Dataloader>(
        MODULE_NAME,
        ["^2.0.0"],
        (dataloader, moduleVersion) => {
          diag.debug(`Applying patch for ${MODULE_NAME}@${moduleVersion}`);

          this._patchLoad(dataloader.prototype);
          this._patchLoadMany(dataloader.prototype);

          return this._getPatchedConstructor(dataloader);
        },
        (dataloader, moduleVersion) => {
          diag.debug(`Removing patch for ${MODULE_NAME}@${moduleVersion}`);

          if (isWrapped(dataloader.prototype.load)) {
            this._unwrap(dataloader.prototype, "load");
          }

          if (isWrapped(dataloader.prototype.loadMany)) {
            this._unwrap(dataloader.prototype, "loadMany");
          }
        }
      ),
    ];
  }

  private _getPatchedConstructor(
    constructor: typeof Dataloader
  ): typeof Dataloader {
    const prototype = constructor.prototype;
    const self = this;

    function PatchedDataloader(
      ...args: ConstructorParameters<typeof constructor>
    ) {
      const inst = new constructor(...args) as DataloaderInternal;

      const originalBatchLoadFn = inst._batchLoadFn;

      inst._batchLoadFn = function patchedBatchLoadFn(
        ...args: Parameters<Dataloader.BatchLoadFn<unknown, unknown>>
      ) {
        if (!self.isEnabled()) {
          return originalBatchLoadFn.call(this, ...args);
        }

        const parent = context.active();
        const span = self.tracer.startSpan(
          `${MODULE_NAME}.batch`,
          {
            links: (inst as any)._batch?.spanLinks as Link[] | undefined,
          },
          parent
        );

        return context.with(trace.setSpan(parent, span), () => {
          return (originalBatchLoadFn.apply(inst, args) as Promise<unknown[]>)
            .then((value) => {
              span.end();
              return value;
            })
            .catch((err) => {
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

      return inst;
    }

    PatchedDataloader.prototype = prototype;
    return PatchedDataloader as unknown as typeof Dataloader;
  }

  private _patchLoad(proto: typeof Dataloader.prototype) {
    if (isWrapped(proto.load)) {
      this._unwrap(proto, "load");
    }

    this._wrap(proto, "load", this._getPatchedLoad.bind(this));
  }

  private _getPatchedLoad(original: LoadFn): LoadFn {
    const instrumentation = this;

    return function patchedLoad(
      this: typeof Dataloader.prototype,
      ...args: Parameters<typeof original>
    ) {
      if (!instrumentation.isEnabled()) {
        return original.call(this, ...args);
      }

      const parent = context.active();
      const span = instrumentation.tracer.startSpan(
        `${MODULE_NAME}.load`,
        { kind: SpanKind.CLIENT },
        parent
      );

      return context.with(trace.setSpan(parent, span), () => {
        const result = original
          .call(this, ...args)
          .then((value) => {
            span.end();
            return value;
          })
          .catch((err) => {
            span.recordException(err);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err.message,
            });
            span.end();
            throw err;
          });

        const loader = this as any;

        if (loader._batch) {
          if (!loader._batch.spanIds) {
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
      this._unwrap(proto, "loadMany");
    }

    this._wrap(proto, "loadMany", this._getPatchedLoadMany.bind(this));
  }

  private _getPatchedLoadMany(original: LoadManyFn): LoadManyFn {
    const instrumentation = this;

    return function patchedLoadMany(
      this: typeof Dataloader.prototype,
      ...args: Parameters<typeof original>
    ) {
      if (!instrumentation.isEnabled()) {
        return original.call(this, ...args);
      }

      const parent = context.active();
      const span = instrumentation.tracer.startSpan(
        `${MODULE_NAME}.loadMany`,
        { kind: SpanKind.CLIENT },
        parent
      );

      return context.with(trace.setSpan(parent, span), () => {
        // .loadMany never rejects, as errors from internal .load
        // calls are caught by dataloader lib
        return original.call(this, ...args).then((value) => {
          span.end();
          return value;
        });
      });
    };
  }
}
