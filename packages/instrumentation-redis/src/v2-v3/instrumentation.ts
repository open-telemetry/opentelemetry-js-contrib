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
  isWrapped,
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import {
  endSpan,
  getTracedCreateClient,
  getTracedCreateStreamTrace,
} from './utils';
import { RedisInstrumentationConfig } from '../types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from '../version';
import type { RedisCommand, RedisPluginClientTypes } from './internal-types';
import { Attributes, SpanKind, context, trace } from '@opentelemetry/api';
import {
  DBSYSTEMVALUES_REDIS,
  SEMATTRS_DB_CONNECTION_STRING,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_OPERATION_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import { defaultDbStatementSerializer } from '@opentelemetry/redis-common';

export class RedisInstrumentationV2_V3 extends InstrumentationBase<RedisInstrumentationConfig> {
  static readonly COMPONENT = 'redis';
  private _semconvStability: SemconvStability;

  constructor(config: RedisInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    this._semconvStability = config.semconvStability
      ? config.semconvStability
      : semconvStabilityFromStr(
          'database',
          process.env.OTEL_SEMCONV_STABILITY_OPT_IN
        );
  }

  override setConfig(config: RedisInstrumentationConfig = {}) {
    super.setConfig(config);
    this._semconvStability = config.semconvStability
      ? config.semconvStability
      : semconvStabilityFromStr(
          'database',
          process.env.OTEL_SEMCONV_STABILITY_OPT_IN
        );
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition(
        'redis',
        ['>=2.6.0 <4'],
        moduleExports => {
          if (
            isWrapped(
              moduleExports.RedisClient.prototype['internal_send_command']
            )
          ) {
            this._unwrap(
              moduleExports.RedisClient.prototype,
              'internal_send_command'
            );
          }
          this._wrap(
            moduleExports.RedisClient.prototype,
            'internal_send_command',
            this._getPatchInternalSendCommand()
          );

          if (isWrapped(moduleExports.RedisClient.prototype['create_stream'])) {
            this._unwrap(moduleExports.RedisClient.prototype, 'create_stream');
          }
          this._wrap(
            moduleExports.RedisClient.prototype,
            'create_stream',
            this._getPatchCreateStream()
          );

          if (isWrapped(moduleExports.createClient)) {
            this._unwrap(moduleExports, 'createClient');
          }
          this._wrap(
            moduleExports,
            'createClient',
            this._getPatchCreateClient()
          );
          return moduleExports;
        },
        moduleExports => {
          if (moduleExports === undefined) return;
          this._unwrap(
            moduleExports.RedisClient.prototype,
            'internal_send_command'
          );
          this._unwrap(moduleExports.RedisClient.prototype, 'create_stream');
          this._unwrap(moduleExports, 'createClient');
        }
      ),
    ];
  }

  /**
   * Patch internal_send_command(...) to trace requests
   */
  private _getPatchInternalSendCommand() {
    const instrumentation = this;
    return function internal_send_command(original: Function) {
      return function internal_send_command_trace(
        this: RedisPluginClientTypes,
        cmd?: RedisCommand
      ) {
        // Versions of redis (2.4+) use a single options object
        // instead of named arguments
        if (arguments.length !== 1 || typeof cmd !== 'object') {
          // We don't know how to trace this call, so don't start/stop a span
          return original.apply(this, arguments);
        }

        const config = instrumentation.getConfig();

        const hasNoParentSpan = trace.getSpan(context.active()) === undefined;
        if (config.requireParentSpan === true && hasNoParentSpan) {
          return original.apply(this, arguments);
        }

        const dbStatementSerializer =
          config?.dbStatementSerializer || defaultDbStatementSerializer;

        const attributes: Attributes = {};

        if (instrumentation._semconvStability & SemconvStability.OLD) {
          Object.assign(attributes, {
            [SEMATTRS_DB_SYSTEM]: DBSYSTEMVALUES_REDIS,
            [SEMATTRS_DB_STATEMENT]: dbStatementSerializer(
              cmd.command,
              cmd.args
            ),
          });
        }

        if (instrumentation._semconvStability & SemconvStability.STABLE) {
          Object.assign(attributes, {
            [ATTR_DB_SYSTEM_NAME]: 'redis',
            [ATTR_DB_OPERATION_NAME]: cmd.command,
            [ATTR_DB_QUERY_TEXT]: dbStatementSerializer(cmd.command, cmd.args),
          });
        }

        const span = instrumentation.tracer.startSpan(
          `${RedisInstrumentationV2_V3.COMPONENT}-${cmd.command}`,
          {
            kind: SpanKind.CLIENT,
            attributes,
          }
        );

        // Set attributes for not explicitly typed RedisPluginClientTypes
        if (this.connection_options) {
          const connectionAttributes: Attributes = {};

          if (instrumentation._semconvStability & SemconvStability.OLD) {
            Object.assign(connectionAttributes, {
              [SEMATTRS_NET_PEER_NAME]: this.connection_options.host,
              [SEMATTRS_NET_PEER_PORT]: this.connection_options.port,
            });
          }

          if (instrumentation._semconvStability & SemconvStability.STABLE) {
            Object.assign(connectionAttributes, {
              [ATTR_SERVER_ADDRESS]: this.connection_options.host,
              [ATTR_SERVER_PORT]: this.connection_options.port,
            });
          }

          span.setAttributes(connectionAttributes);
        }

        if (
          this.address &&
          instrumentation._semconvStability & SemconvStability.OLD
        ) {
          span.setAttribute(
            SEMATTRS_DB_CONNECTION_STRING,
            `redis://${this.address}`
          );
        }

        const originalCallback = arguments[0].callback;
        if (originalCallback) {
          const originalContext = context.active();
          (arguments[0] as RedisCommand).callback = function callback<T>(
            this: unknown,
            err: Error | null,
            reply: T
          ) {
            if (config?.responseHook) {
              const responseHook = config.responseHook;
              safeExecuteInTheMiddle(
                () => {
                  responseHook(span, cmd.command, cmd.args, reply);
                },
                err => {
                  if (err) {
                    instrumentation._diag.error(
                      'Error executing responseHook',
                      err
                    );
                  }
                },
                true
              );
            }

            endSpan(span, err);
            return context.with(
              originalContext,
              originalCallback,
              this,
              ...arguments
            );
          };
        }
        try {
          // Span will be ended in callback
          return original.apply(this, arguments);
        } catch (rethrow: any) {
          endSpan(span, rethrow);
          throw rethrow; // rethrow after ending span
        }
      };
    };
  }

  private _getPatchCreateClient() {
    return function createClient(original: Function) {
      return getTracedCreateClient(original);
    };
  }

  private _getPatchCreateStream() {
    return function createReadStream(original: Function) {
      return getTracedCreateStreamTrace(original);
    };
  }
}
