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
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import * as constants from './constants';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import * as utils from './utils';
import { KnexInstrumentationConfig } from './types';
import {
  ATTR_DB_COLLECTION_NAME,
  ATTR_DB_NAMESPACE,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_DB_NAME,
  ATTR_DB_OPERATION,
  ATTR_DB_SQL_TABLE,
  ATTR_DB_STATEMENT,
  ATTR_DB_SYSTEM,
  ATTR_DB_USER,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
  ATTR_NET_TRANSPORT,
} from './semconv';

const contextSymbol = Symbol('opentelemetry.instrumentation-knex.context');
const DEFAULT_CONFIG: KnexInstrumentationConfig = {
  maxQueryLength: 1022,
  requireParentSpan: false,
};

export class KnexInstrumentation extends InstrumentationBase<KnexInstrumentationConfig> {
  private _semconvStability: SemconvStability;

  constructor(config: KnexInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, { ...DEFAULT_CONFIG, ...config });

    this._semconvStability = semconvStabilityFromStr(
      'database',
      process.env.OTEL_SEMCONV_STABILITY_OPT_IN
    );
  }

  override setConfig(config: KnexInstrumentationConfig = {}) {
    super.setConfig({ ...DEFAULT_CONFIG, ...config });
  }

  init() {
    const module = new InstrumentationNodeModuleDefinition(
      constants.MODULE_NAME,
      constants.SUPPORTED_VERSIONS
    );

    module.files.push(
      this.getClientNodeModuleFileInstrumentation('src'),
      this.getClientNodeModuleFileInstrumentation('lib'),
      this.getRunnerNodeModuleFileInstrumentation('src'),
      this.getRunnerNodeModuleFileInstrumentation('lib'),
      this.getRunnerNodeModuleFileInstrumentation('lib/execution')
    );

    return module;
  }

  private getRunnerNodeModuleFileInstrumentation(basePath: string) {
    return new InstrumentationNodeModuleFile(
      `knex/${basePath}/runner.js`,
      constants.SUPPORTED_VERSIONS,
      (Runner: any, moduleVersion) => {
        this.ensureWrapped(
          Runner.prototype,
          'query',
          this.createQueryWrapper(moduleVersion)
        );
        return Runner;
      },
      (Runner: any, moduleVersion) => {
        this._unwrap(Runner.prototype, 'query');
        return Runner;
      }
    );
  }

  private getClientNodeModuleFileInstrumentation(basePath: string) {
    return new InstrumentationNodeModuleFile(
      `knex/${basePath}/client.js`,
      constants.SUPPORTED_VERSIONS,
      (Client: any) => {
        this.ensureWrapped(
          Client.prototype,
          'queryBuilder',
          this.storeContext.bind(this)
        );
        this.ensureWrapped(
          Client.prototype,
          'schemaBuilder',
          this.storeContext.bind(this)
        );
        this.ensureWrapped(
          Client.prototype,
          'raw',
          this.storeContext.bind(this)
        );
        return Client;
      },
      (Client: any) => {
        this._unwrap(Client.prototype, 'queryBuilder');
        this._unwrap(Client.prototype, 'schemaBuilder');
        this._unwrap(Client.prototype, 'raw');
        return Client;
      }
    );
  }

  private createQueryWrapper(moduleVersion?: string) {
    const instrumentation = this;

    return function wrapQuery(original: (...args: any[]) => any) {
      return function wrapped_logging_method(this: any, query: any) {
        const config = this.client.config;

        const table = utils.extractTableName(this.builder);
        // `method` actually refers to the knex API method - Not exactly "operation"
        // in the spec sense, but matches most of the time.
        const operation = query?.method;
        const name =
          config?.connection?.filename || config?.connection?.database;
        const { maxQueryLength } = instrumentation.getConfig();

        const attributes: api.Attributes = {
          'knex.version': moduleVersion,
        };
        const transport =
          config?.connection?.filename === ':memory:' ? 'inproc' : undefined;

        if (instrumentation._semconvStability & SemconvStability.OLD) {
          Object.assign(attributes, {
            [ATTR_DB_SYSTEM]: utils.mapSystem(config.client),
            [ATTR_DB_SQL_TABLE]: table,
            [ATTR_DB_OPERATION]: operation,
            [ATTR_DB_USER]: config?.connection?.user,
            [ATTR_DB_NAME]: name,
            [ATTR_NET_PEER_NAME]: config?.connection?.host,
            [ATTR_NET_PEER_PORT]: config?.connection?.port,
            [ATTR_NET_TRANSPORT]: transport,
          });
        }
        if (instrumentation._semconvStability & SemconvStability.STABLE) {
          Object.assign(attributes, {
            [ATTR_DB_SYSTEM_NAME]: utils.mapSystem(config.client),
            [ATTR_DB_COLLECTION_NAME]: table,
            [ATTR_DB_OPERATION_NAME]: operation,
            [ATTR_DB_NAMESPACE]: name,
            [ATTR_SERVER_ADDRESS]: config?.connection?.host,
            [ATTR_SERVER_PORT]: config?.connection?.port,
          });
        }
        if (maxQueryLength) {
          // filters both undefined and 0
          const queryText = utils.limitLength(query?.sql, maxQueryLength);
          if (instrumentation._semconvStability & SemconvStability.STABLE) {
            attributes[ATTR_DB_QUERY_TEXT] = queryText;
          }
          if (instrumentation._semconvStability & SemconvStability.OLD) {
            attributes[ATTR_DB_STATEMENT] = queryText;
          }
        }

        const parentContext =
          this.builder[contextSymbol] || api.context.active();
        const parentSpan = api.trace.getSpan(parentContext);
        const hasActiveParent =
          parentSpan && api.trace.isSpanContextValid(parentSpan.spanContext());
        if (instrumentation._config.requireParentSpan && !hasActiveParent) {
          return original.bind(this)(...arguments);
        }

        const span = instrumentation.tracer.startSpan(
          utils.getName(name, operation, table),
          {
            kind: api.SpanKind.CLIENT,
            attributes,
          },
          parentContext
        );
        const spanContext = api.trace.setSpan(api.context.active(), span);

        return api.context
          .with(spanContext, original, this, ...arguments)
          .then((result: unknown) => {
            span.end();
            return result;
          })
          .catch((err: any) => {
            // knex adds full query with all the binding values to the message,
            // we want to undo that without changing the original error
            const formatter = utils.getFormatter(this);
            const fullQuery = formatter(query.sql, query.bindings || []);
            const message = err.message.replace(fullQuery + ' - ', '');
            const exc = utils.otelExceptionFromKnexError(err, message);
            span.recordException(exc);
            span.setStatus({ code: api.SpanStatusCode.ERROR, message });
            span.end();
            throw err;
          });
      };
    };
  }

  private storeContext(original: Function) {
    return function wrapped_logging_method(this: any) {
      const builder = original.apply(this, arguments);
      // Builder is a custom promise type and when awaited it fails to propagate context.
      // We store the parent context at the moment of initiating the builder
      // otherwise we'd have nothing to attach the span as a child for in `query`.
      Object.defineProperty(builder, contextSymbol, {
        value: api.context.active(),
      });
      return builder;
    };
  }

  ensureWrapped(obj: any, methodName: string, wrapper: (original: any) => any) {
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(obj, methodName, wrapper);
  }
}
