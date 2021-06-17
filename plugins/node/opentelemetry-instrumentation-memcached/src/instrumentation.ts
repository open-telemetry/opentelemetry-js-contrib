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
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import * as utils from './utils';
import { InstrumentationConfig } from './types';
import { VERSION } from './version';

export class Instrumentation extends InstrumentationBase<typeof Memcached> {
  static readonly COMPONENT = 'memcached';
  static readonly COMMON_ATTRIBUTES = {
    [SemanticAttributes.DB_SYSTEM]: Instrumentation.COMPONENT,
  };
  static readonly DEFAULT_CONFIG: InstrumentationConfig = {
    collectCommand: false,
  };

  constructor(config: InstrumentationConfig = Instrumentation.DEFAULT_CONFIG) {
    super(
      '@opentelemetry/instrumentation-memcached',
      VERSION,
      Object.assign({}, Instrumentation.DEFAULT_CONFIG, config)
    );
  }

  setConfig(config: InstrumentationConfig = Instrumentation.DEFAULT_CONFIG) {
    this._config = Object.assign({}, Instrumentation.DEFAULT_CONFIG, config);
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition<typeof Memcached>(
        'memcached',
        ['>=2.2'],
        (moduleExports, moduleVersion) => {
          api.diag.debug(
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
          api.diag.debug(
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
      const span = instrumentation.tracer.startSpan('<type> <key>', {
        kind: api.SpanKind.CLIENT,
        attributes: {
          'memcached.version': moduleVersion,
          ...Instrumentation.COMMON_ATTRIBUTES,
        },
      });
      const context = api.trace.setSpan(api.context.active(), span);

      return api.context.with(
        context,
        original,
        this,
        instrumentation.wrapQueryCompiler.call(
          instrumentation,
          queryCompiler,
          this,
          server,
          context,
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
    context: api.Context,
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
        'db.statement': (instrumentation._config as InstrumentationConfig)
          .collectCommand
          ? query.command
          : undefined,
        ...utils.getPeerAttributes(client, server, query),
      });

      query.callback = api.context.bind(
        context,
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
    api.diag.debug(
      `Applying ${methodName} patch for ${Instrumentation.COMPONENT}@${moduleVersion}`
    );
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(obj, methodName, wrapper);
  }
}
