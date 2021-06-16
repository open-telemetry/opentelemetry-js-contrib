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
import type * as memcachedTypes from 'memcached';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import * as utils from './utils';
import { InstrumentationConfig } from './types';
import { VERSION } from './version';

const DEFAULT_CONFIG: InstrumentationConfig = {
  includeFullStatement: false,
};

export class Instrumentation extends InstrumentationBase<
  typeof memcachedTypes
> {
  static readonly COMPONENT = 'memcached';
  static readonly COMMON_ATTRIBUTES = {
    [SemanticAttributes.DB_SYSTEM]: Instrumentation.COMPONENT,
  };

  constructor(config: InstrumentationConfig = DEFAULT_CONFIG) {
    super(
      '@opentelemetry/instrumentation-memcached',
      VERSION,
      Object.assign({}, DEFAULT_CONFIG, config)
    );
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition<typeof memcachedTypes>(
        'memcached',
        ['>=2.2'],
        (moduleExports, moduleVersion) => {
          api.diag.debug(`Patching memcached@${moduleVersion}`);
          const instrumentation = this;
          this.ensureWrapped(
            moduleVersion,
            moduleExports.prototype,
            'command',
            original => {
              return function (queryCompiler, server) {
                if (typeof queryCompiler !== 'function') {
                  return original.apply(this, arguments);
                }
                // The name will be overwritten later
                const span = instrumentation.tracer.startSpan(
                  '<command> <key>',
                  {
                    kind: api.SpanKind.CLIENT,
                    attributes: {
                      'memcached.version': moduleVersion,
                      ...Instrumentation.COMMON_ATTRIBUTES,
                    },
                  }
                );
                const context = api.trace.setSpan(api.context.active(), span);

                return api.context.with(
                  context,
                  original,
                  this,
                  wrapQueryCompiler.call(
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
          );
          return moduleExports;
        },
        (moduleExports, moduleVersion) => {
          api.diag.debug(`Unpatching memcached@${moduleVersion}`);
          if (moduleExports === undefined) return;
          this._unwrap(moduleExports.prototype, 'command');
        }
      ),
    ];
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

function wrapQueryCompiler(original, client, server, context, span) {
  const instrumentation = this;
  return function () {
    const query = original.apply(this, arguments);
    const callback = query.callback;

    span.updateName(`${query.type} ${query.key}`);
    span.setAttributes({
      'db.memcached.key': query.key,
      'db.memcached.lifetime': query.lifetime,
      [SemanticAttributes.DB_OPERATION]: query.type,
      'db.statement': instrumentation._config.includeFullStatement
        ? query.command
        : undefined,
      ...utils.getPeerAttributes(client, server, query),
    });

    query.callback = api.context.bind(function (err) {
      if (err) {
        span.recordException(err);
        span.setStatus({
          code: api.SpanStatusCode.ERROR,
          message: err.message,
        });
      }

      span.end();

      if (typeof callback === 'function') {
        return callback.apply(this, arguments);
      }
    }, context);

    return query;
  };
}
