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
import { BasePlugin } from '@opentelemetry/core';
import * as shimmer from 'shimmer';
import * as mongoose from 'mongoose';

import { AttributeNames } from './enums';

import {
  startSpan,
  handleError,
  setErrorStatus,
  safeStringify,
  getAttributesFromCollection,
  handleExecResponse,
  _STORED_PARENT_SPAN,
} from './utils';

import { VERSION } from './version';

const contextCaptureFunctions = [
  'remove',
  'deleteOne',
  'deleteMany',
  'find',
  'findOne',
  'estimatedDocumentCount',
  'countDocuments',
  'count',
  'distinct',
  'where',
  '$where',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndRemove',
];

export class MongoosePlugin extends BasePlugin<typeof mongoose> {
  constructor(readonly moduleName: string) {
    super('@wdalmut/opentelemetry-plugin-mongoose', VERSION);
  }

  protected patch() {
    this._logger.debug('MongoosePlugin: patch mongoose plugin');

    shimmer.wrap(
      this._moduleExports.Model.prototype,
      'save',
      this.patchOnModelMethods('save')
    );
    shimmer.wrap(
      this._moduleExports.Model.prototype,
      'remove',
      this.patchOnModelMethods('remove')
    );
    shimmer.wrap(
      this._moduleExports.Query.prototype,
      'exec',
      this.patchQueryExec()
    );
    shimmer.wrap(
      this._moduleExports.Aggregate.prototype,
      'exec',
      this.patchAggregateExec()
    );

    contextCaptureFunctions.forEach((funcName: string) => {
      shimmer.wrap(
        this._moduleExports.Query.prototype,
        funcName as any,
        this.patchAndCaptureSpanContext(funcName)
      );
    });
    shimmer.wrap(
      this._moduleExports.Model,
      'aggregate',
      this.patchModelAggregate()
    );

    return this._moduleExports;
  }

  private patchAggregateExec() {
    const plugin = this;
    plugin._logger.debug(
      'MongoosePlugin: patched mongoose Aggregate exec prototype'
    );
    return (originalExec: Function) => {
      return function exec(this: any) {
        const parentSpan = this[_STORED_PARENT_SPAN];
        const span = startSpan(
          plugin._tracer,
          this._model?.modelName,
          'aggregate',
          parentSpan
        );
        span.setAttributes(getAttributesFromCollection(this._model.collection));
        span.setAttribute(AttributeNames.DB_QUERY_TYPE, 'aggregate');
        span.setAttribute(
          AttributeNames.DB_OPTIONS,
          JSON.stringify(this.options)
        );
        span.setAttribute(
          AttributeNames.DB_AGGREGATE_PIPELINE,
          JSON.stringify(this._pipeline)
        );

        const aggregateResponse = originalExec.apply(this, arguments);
        return handleExecResponse(
          aggregateResponse,
          span,
          plugin?._config?.enhancedDatabaseReporting
        );
      };
    };
  }

  private patchQueryExec() {
    const plugin = this;
    plugin._logger.debug(
      'MongoosePlugin: patched mongoose Query exec prototype'
    );
    return (originalExec: Function) => {
      return function exec(this: any) {
        const parentSpan = this[_STORED_PARENT_SPAN];
        const span = startSpan(
          plugin._tracer,
          this.model.modelName,
          this.op,
          parentSpan
        );

        span.setAttributes(
          getAttributesFromCollection(this.mongooseCollection)
        );

        span.setAttribute(AttributeNames.DB_QUERY_TYPE, this.op);
        span.setAttribute(
          AttributeNames.DB_STATEMENT,
          JSON.stringify(this._conditions)
        );
        span.setAttribute(
          AttributeNames.DB_OPTIONS,
          JSON.stringify(this.options)
        );
        span.setAttribute(
          AttributeNames.DB_UPDATE,
          JSON.stringify(this._update)
        );

        const queryResponse = originalExec.apply(this, arguments);
        return handleExecResponse(
          queryResponse,
          span,
          plugin?._config?.enhancedDatabaseReporting
        );
      };
    };
  }

  private patchOnModelMethods(op: string) {
    const plugin = this;
    plugin._logger.debug(
      `MongoosePlugin: patched mongoose Model ${op} prototype`
    );
    return (originalOnModelFunction: Function) => {
      return function method(this: any, options?: any, fn?: Function) {
        const span = startSpan(plugin._tracer, this.constructor.modelName, op);
        span.setAttributes(
          getAttributesFromCollection(this.constructor.collection)
        );

        span.setAttribute(AttributeNames.DB_QUERY_TYPE, op);

        if (plugin?._config?.enhancedDatabaseReporting) {
          span.setAttribute(AttributeNames.DB_SAVE, safeStringify(this));
        }

        if (options instanceof Function) {
          fn = options;
          options = undefined;
        }

        if (fn instanceof Function) {
          return originalOnModelFunction.apply(this, [
            options,
            (err: Error, product: mongoose.Document) => {
              if (err) {
                setErrorStatus(span, err);
              }
              span.end();
              return fn!(err, product);
            },
          ]);
        } else {
          return originalOnModelFunction
            .apply(this, arguments)
            .then((response: any) => {
              span.end();
              return response;
            })
            .catch((err: any) => {
              const error = handleError(span)(err);
              span.end();
              return error;
            });
        }
      };
    };
  }

  // we want to capture the otel span on the object which is calling exec.
  // in the special case of aggregate, we need have no function to path
  // on the Aggregate object to capture the context on, so we patch
  // the aggregate of Model, and set the context on the Aggregate object
  private patchModelAggregate() {
    const plugin = this;
    plugin._logger.debug('MongoosePlugin: patched mongoose model aggregate');
    return (original: Function) => {
      return function captureSpanContext(this: any) {
        const currentSpan = plugin._tracer.getCurrentSpan();
        const aggregate = original.apply(this, arguments);
        if (aggregate) aggregate[_STORED_PARENT_SPAN] = currentSpan;
        return aggregate;
      };
    };
  }

  private patchAndCaptureSpanContext(funcName: string) {
    const plugin = this;
    plugin._logger.debug(
      `MongoosePlugin: patched mongoose query ${funcName} prototype`
    );
    return (original: Function) => {
      return function captureSpanContext(this: any) {
        this[_STORED_PARENT_SPAN] = plugin._tracer.getCurrentSpan();
        return original.apply(this, arguments);
      };
    };
  }

  protected unpatch(): void {
    this._logger.debug('MongoosePlugin: unpatch mongoose plugin');
    shimmer.unwrap(this._moduleExports.Model.prototype, 'save');
    shimmer.unwrap(this._moduleExports.Model.prototype, 'remove');
    shimmer.unwrap(this._moduleExports.Query.prototype, 'exec');

    contextCaptureFunctions.forEach((funcName: string) => {
      shimmer.unwrap(this._moduleExports.Query.prototype, funcName as any);
    });
    shimmer.unwrap(this._moduleExports.Model, 'aggregate');
  }
}

export const plugin = new MongoosePlugin('mongoose');
