/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as api from '@opentelemetry/api';
import {
  isWrapped,
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import type * as Memcached from 'memcached';
import {
  DB_SYSTEM_NAME_VALUE_MEMCACHED,
} from './semconv';
import {
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
} from '@opentelemetry/semantic-conventions';

import * as utils from './utils';
import { InstrumentationConfig } from './types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

export class MemcachedInstrumentation extends InstrumentationBase<InstrumentationConfig> {
  static readonly COMPONENT = 'memcached';
  static readonly DEFAULT_CONFIG: InstrumentationConfig = {
    enhancedDatabaseReporting: false,
  };

  constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, {
      ...MemcachedInstrumentation.DEFAULT_CONFIG,
      ...config,
    });
  }

  override setConfig(config: InstrumentationConfig = {}) {
    super.setConfig({ ...MemcachedInstrumentation.DEFAULT_CONFIG, ...config });
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition(
        'memcached',
        ['>=2.2.0 <3'],
        (moduleExports: typeof Memcached, moduleVersion) => {
          this.ensureWrapped(
            moduleExports.prototype,
            'command',
            this.wrapCommand.bind(this, moduleVersion)
          );
          return moduleExports;
        },
        (moduleExports: typeof Memcached) => {
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

      const attributes: api.Attributes = {
        'memcached.version': moduleVersion,
      };

      attributes[ATTR_DB_SYSTEM_NAME] = DB_SYSTEM_NAME_VALUE_MEMCACHED;

      // The name will be overwritten later
      const span = instrumentation.tracer.startSpan(
        'unknown memcached command',
        {
          kind: api.SpanKind.CLIENT,
          attributes,
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

      span.updateName(`memcached ${query.type}`);

      const attributes: api.Attributes = {
        'db.memcached.key': query.key,
        'db.memcached.lifetime': query.lifetime,
        ...utils.getPeerAttributes(
          client,
          server,
          query
        ),
      };

      attributes[ATTR_DB_OPERATION_NAME] = query.type;

      if (instrumentation.getConfig().enhancedDatabaseReporting) {
        attributes[ATTR_DB_QUERY_TEXT] = query.command;
      }

      span.setAttributes(attributes);

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
    obj: any,
    methodName: string,
    wrapper: (original: any) => any
  ) {
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(obj, methodName, wrapper);
  }
}
