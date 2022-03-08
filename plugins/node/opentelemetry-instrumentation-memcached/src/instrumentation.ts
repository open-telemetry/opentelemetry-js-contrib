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
import {
  isWrapped,
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import type * as Memcached from 'memcached';
import {
  DbSystemValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import * as utils from './utils';
import { InstrumentationConfig } from './types';
import { VERSION } from './version';

export class Instrumentation extends InstrumentationBase<typeof Memcached> {
  static readonly COMPONENT = 'memcached';
  static readonly COMMON_ATTRIBUTES = {
    [SemanticAttributes.DB_SYSTEM]: DbSystemValues.MEMCACHED,
  };
  static readonly DEFAULT_CONFIG: InstrumentationConfig = {
    enhancedDatabaseReporting: false,
  };

  constructor(config: InstrumentationConfig = {}) {
    super(
      '@opentelemetry/instrumentation-memcached',
      VERSION,
      Object.assign({}, Instrumentation.DEFAULT_CONFIG, config)
    );
  }

  override setConfig(config: InstrumentationConfig = {}) {
    this._config = Object.assign({}, Instrumentation.DEFAULT_CONFIG, config);
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition<typeof Memcached>(
        'memcached',
        ['>=2.2'],
        (moduleExports, moduleVersion) => {
          this._diag.debug(
            `Patching ${Instrumentation.COMPONENT}@${moduleVersion}`
          );
          this.ensureWrapped(
            moduleVersion,
            moduleExports.prototype,
            'command',
            this.wrapCommand.bind(this, moduleVersion)
          );
          return moduleExports;
        },
        (moduleExports, moduleVersion) => {
          this._diag.debug(
            `Unpatching ${Instrumentation.COMPONENT}@${moduleVersion}`
          );
          if (moduleExports === undefined) return;
          // `command` is documented API missing from the types
          this._unwrap(moduleExports.prototype, 'command' as keyof Memcached);
        }
      ),
    ];
  }

  wrapCommand(
    moduleVersion: undefined | string,
    original: (
      queryCompiler: () => Memcached.CommandData,
      server?: string
    ) => any
  ) {
    const instrumentation = this;
    return function (
      this: Memcached,
      queryCompiler: () => Memcached.CommandData,
      server?: string
    ) {
      if (typeof queryCompiler !== 'function') {
        return original.apply(this, arguments as any);
      }
      // The name will be overwritten later
      const span = instrumentation.tracer.startSpan(
        'unknown memcached command',
        {
          kind: api.SpanKind.CLIENT,
          attributes: {
            'memcached.version': moduleVersion,
            ...Instrumentation.COMMON_ATTRIBUTES,
          },
        }
      );
      const parentContext = api.context.active();
      const context = api.trace.setSpan(parentContext, span);

      return api.context.with(
        context,
        original,
        this,
        instrumentation.wrapQueryCompiler.call(
          instrumentation,
          queryCompiler,
          this,
          server,
          parentContext,
          span
        ),
        server
      );
    };
  }

  wrapQueryCompiler(
    original: () => Memcached.CommandData,
    client: Memcached,
    server: undefined | string,
    callbackContext: api.Context,
    span: api.Span
  ) {
    const instrumentation = this;
    return function (this: Memcached) {
      const query = original.apply(this, arguments as any);
      const callback = query.callback;

      span.updateName(`${query.type} ${query.key}`);
      span.setAttributes({
        'db.memcached.key': query.key,
        'db.memcached.lifetime': query.lifetime,
        [SemanticAttributes.DB_OPERATION]: query.type,
        [SemanticAttributes.DB_STATEMENT]: (
          instrumentation._config as InstrumentationConfig
        ).enhancedDatabaseReporting
          ? query.command
          : undefined,
        ...utils.getPeerAttributes(client, server, query),
      });

      query.callback = api.context.bind(
        callbackContext,
        function (this: Memcached.CommandData, err: any) {
          if (err) {
            span.recordException(err);
            span.setStatus({
              code: api.SpanStatusCode.ERROR,
              message: err.message,
            });
          }

          span.end();

          if (typeof callback === 'function') {
            return callback.apply(this, arguments as any);
          }
        }
      );

      return query;
    };
  }

  private ensureWrapped(
    moduleVersion: string | undefined,
    obj: any,
    methodName: string,
    wrapper: (original: any) => any
  ) {
    this._diag.debug(
      `Applying ${methodName} patch for ${Instrumentation.COMPONENT}@${moduleVersion}`
    );
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(obj, methodName, wrapper);
  }
}
