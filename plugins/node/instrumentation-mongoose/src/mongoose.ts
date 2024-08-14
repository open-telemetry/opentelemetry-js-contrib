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
import { context, Span, trace, Attributes, SpanKind } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import type * as mongoose from 'mongoose';
import { MongooseInstrumentationConfig, SerializerPayload } from './types';
import {
  handleCallbackResponse,
  handlePromiseResponse,
  getAttributesFromCollection,
} from './utils';
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import {
  SEMATTRS_DB_OPERATION,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
} from '@opentelemetry/semantic-conventions';

const contextCaptureFunctionsCommon = [
  'deleteOne',
  'deleteMany',
  'find',
  'findOne',
  'estimatedDocumentCount',
  'countDocuments',
  'distinct',
  'where',
  '$where',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
];

const contextCaptureFunctions6 = [
  'remove',
  'count',
  'findOneAndRemove',
  ...contextCaptureFunctionsCommon,
];
const contextCaptureFunctions7 = [
  'count',
  'findOneAndRemove',
  ...contextCaptureFunctionsCommon,
];
const contextCaptureFunctions8 = [...contextCaptureFunctionsCommon];

function getContextCaptureFunctions(
  moduleVersion: string | undefined
): string[] {
  /* istanbul ignore next */
  if (!moduleVersion) {
    return contextCaptureFunctionsCommon;
  } else if (moduleVersion.startsWith('6.') || moduleVersion.startsWith('5.')) {
    return contextCaptureFunctions6;
  } else if (moduleVersion.startsWith('7.')) {
    return contextCaptureFunctions7;
  } else {
    return contextCaptureFunctions8;
  }
}

function instrumentRemove(moduleVersion: string | undefined): boolean {
  return (
    (moduleVersion &&
      (moduleVersion.startsWith('5.') || moduleVersion.startsWith('6.'))) ||
    false
  );
}

// when mongoose functions are called, we store the original call context
// and then set it as the parent for the spans created by Query/Aggregate exec()
// calls. this bypass the unlinked spans issue on thenables await operations.
export const _STORED_PARENT_SPAN: unique symbol = Symbol('stored-parent-span');

export class MongooseInstrumentation extends InstrumentationBase<MongooseInstrumentationConfig> {
  constructor(config: MongooseInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  protected init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      'mongoose',
      ['>=5.9.7 <9'],
      this.patch.bind(this),
      this.unpatch.bind(this)
    );
    return module;
  }

  private patch(
    moduleExports: typeof mongoose,
    moduleVersion: string | undefined
  ) {
    this._wrap(
      moduleExports.Model.prototype,
      'save',
      this.patchOnModelMethods('save', moduleVersion)
    );
    // mongoose applies this code on module require:
    // Model.prototype.$save = Model.prototype.save;
    // which captures the save function before it is patched.
    // so we need to apply the same logic after instrumenting the save function.
    moduleExports.Model.prototype.$save = moduleExports.Model.prototype.save;

    if (instrumentRemove(moduleVersion)) {
      this._wrap(
        moduleExports.Model.prototype,
        'remove',
        this.patchOnModelMethods('remove', moduleVersion)
      );
    }

    this._wrap(
      moduleExports.Query.prototype,
      'exec',
      this.patchQueryExec(moduleVersion)
    );
    this._wrap(
      moduleExports.Aggregate.prototype,
      'exec',
      this.patchAggregateExec(moduleVersion)
    );

    const contextCaptureFunctions = getContextCaptureFunctions(moduleVersion);

    contextCaptureFunctions.forEach((funcName: string) => {
      this._wrap(
        moduleExports.Query.prototype,
        funcName as any,
        this.patchAndCaptureSpanContext(funcName)
      );
    });
    this._wrap(moduleExports.Model, 'aggregate', this.patchModelAggregate());

    return moduleExports;
  }

  private unpatch(
    moduleExports: typeof mongoose,
    moduleVersion: string | undefined
  ): void {
    const contextCaptureFunctions = getContextCaptureFunctions(moduleVersion);

    this._unwrap(moduleExports.Model.prototype, 'save');
    // revert the patch for $save which we applied by aliasing it to patched `save`
    moduleExports.Model.prototype.$save = moduleExports.Model.prototype.save;

    if (instrumentRemove(moduleVersion)) {
      this._unwrap(moduleExports.Model.prototype, 'remove');
    }

    this._unwrap(moduleExports.Query.prototype, 'exec');
    this._unwrap(moduleExports.Aggregate.prototype, 'exec');

    contextCaptureFunctions.forEach((funcName: string) => {
      this._unwrap(moduleExports.Query.prototype, funcName as any);
    });
    this._unwrap(moduleExports.Model, 'aggregate');
  }

  private patchAggregateExec(moduleVersion: string | undefined) {
    const self = this;
    return (originalAggregate: Function) => {
      return function exec(this: any, callback?: Function) {
        if (
          self.getConfig().requireParentSpan &&
          trace.getSpan(context.active()) === undefined
        ) {
          return originalAggregate.apply(this, arguments);
        }

        const parentSpan = this[_STORED_PARENT_SPAN];
        const attributes: Attributes = {};
        const { dbStatementSerializer } = self.getConfig();
        if (dbStatementSerializer) {
          attributes[SEMATTRS_DB_STATEMENT] = dbStatementSerializer(
            'aggregate',
            {
              options: this.options,
              aggregatePipeline: this._pipeline,
            }
          );
        }

        const span = self._startSpan(
          this._model.collection,
          this._model?.modelName,
          'aggregate',
          attributes,
          parentSpan
        );

        return self._handleResponse(
          span,
          originalAggregate,
          this,
          arguments,
          callback,
          moduleVersion
        );
      };
    };
  }

  private patchQueryExec(moduleVersion: string | undefined) {
    const self = this;
    return (originalExec: Function) => {
      return function exec(this: any, callback?: Function) {
        if (
          self.getConfig().requireParentSpan &&
          trace.getSpan(context.active()) === undefined
        ) {
          return originalExec.apply(this, arguments);
        }

        const parentSpan = this[_STORED_PARENT_SPAN];
        const attributes: Attributes = {};
        const { dbStatementSerializer } = self.getConfig();
        if (dbStatementSerializer) {
          attributes[SEMATTRS_DB_STATEMENT] = dbStatementSerializer(this.op, {
            condition: this._conditions,
            updates: this._update,
            options: this.options,
            fields: this._fields,
          });
        }
        const span = self._startSpan(
          this.mongooseCollection,
          this.model.modelName,
          this.op,
          attributes,
          parentSpan
        );

        return self._handleResponse(
          span,
          originalExec,
          this,
          arguments,
          callback,
          moduleVersion
        );
      };
    };
  }

  private patchOnModelMethods(op: string, moduleVersion: string | undefined) {
    const self = this;
    return (originalOnModelFunction: Function) => {
      return function method(this: any, options?: any, callback?: Function) {
        if (
          self.getConfig().requireParentSpan &&
          trace.getSpan(context.active()) === undefined
        ) {
          return originalOnModelFunction.apply(this, arguments);
        }

        const serializePayload: SerializerPayload = { document: this };
        if (options && !(options instanceof Function)) {
          serializePayload.options = options;
        }
        const attributes: Attributes = {};
        const { dbStatementSerializer } = self.getConfig();
        if (dbStatementSerializer) {
          attributes[SEMATTRS_DB_STATEMENT] = dbStatementSerializer(
            op,
            serializePayload
          );
        }
        const span = self._startSpan(
          this.constructor.collection,
          this.constructor.modelName,
          op,
          attributes
        );

        if (options instanceof Function) {
          callback = options;
          options = undefined;
        }

        return self._handleResponse(
          span,
          originalOnModelFunction,
          this,
          arguments,
          callback,
          moduleVersion
        );
      };
    };
  }

  // we want to capture the otel span on the object which is calling exec.
  // in the special case of aggregate, we need have no function to path
  // on the Aggregate object to capture the context on, so we patch
  // the aggregate of Model, and set the context on the Aggregate object
  private patchModelAggregate() {
    const self = this;
    return (original: Function) => {
      return function captureSpanContext(this: any) {
        const currentSpan = trace.getSpan(context.active());
        const aggregate = self._callOriginalFunction(() =>
          original.apply(this, arguments)
        );
        if (aggregate) aggregate[_STORED_PARENT_SPAN] = currentSpan;
        return aggregate;
      };
    };
  }

  private patchAndCaptureSpanContext(funcName: string) {
    const self = this;
    return (original: Function) => {
      return function captureSpanContext(this: any) {
        this[_STORED_PARENT_SPAN] = trace.getSpan(context.active());
        return self._callOriginalFunction(() =>
          original.apply(this, arguments)
        );
      };
    };
  }

  private _startSpan(
    collection: mongoose.Collection,
    modelName: string,
    operation: string,
    attributes: Attributes,
    parentSpan?: Span
  ): Span {
    return this.tracer.startSpan(
      `mongoose.${modelName}.${operation}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          ...attributes,
          ...getAttributesFromCollection(collection),
          [SEMATTRS_DB_OPERATION]: operation,
          [SEMATTRS_DB_SYSTEM]: 'mongoose',
        },
      },
      parentSpan ? trace.setSpan(context.active(), parentSpan) : undefined
    );
  }

  private _handleResponse(
    span: Span,
    exec: Function,
    originalThis: any,
    args: IArguments,
    callback?: Function,
    moduleVersion: string | undefined = undefined
  ) {
    const self = this;
    if (callback instanceof Function) {
      return self._callOriginalFunction(() =>
        handleCallbackResponse(
          callback,
          exec,
          originalThis,
          span,
          args,
          self.getConfig().responseHook,
          moduleVersion
        )
      );
    } else {
      const response = self._callOriginalFunction(() =>
        exec.apply(originalThis, args)
      );
      return handlePromiseResponse(
        response,
        span,
        self.getConfig().responseHook,
        moduleVersion
      );
    }
  }

  private _callOriginalFunction<T>(originalFunction: (...args: any[]) => T): T {
    if (this.getConfig().suppressInternalInstrumentation) {
      return context.with(suppressTracing(context.active()), originalFunction);
    } else {
      return originalFunction();
    }
  }
}
