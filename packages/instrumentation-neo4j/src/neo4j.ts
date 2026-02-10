/*
 * Copyright Splunk Inc., Aspecto
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  SpanStatusCode,
  diag,
  trace,
  context,
  SpanKind,
} from '@opentelemetry/api';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import type * as neo4j from 'neo4j-driver';
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleFile,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { ATTR_DB_NAMESPACE, ATTR_DB_OPERATION_NAME, ATTR_DB_QUERY_TEXT, ATTR_DB_SYSTEM_NAME } from '@opentelemetry/semantic-conventions';
import { Neo4jInstrumentationConfig } from './types';
import { getAttributesFromNeo4jSession } from './utils';

type RunArgs =
  | Parameters<neo4j.Session['run']>
  | Parameters<neo4j.Transaction['run']>;

export class Neo4jInstrumentation extends InstrumentationBase<Neo4jInstrumentationConfig> {
  constructor(config: Neo4jInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  protected init(): InstrumentationModuleDefinition[] {
    return [
      this.getModuleDefinition('neo4j-driver-core', ['>=4.3.0 <7']),
      this.getModuleDefinition('neo4j-driver', ['>=4.0.0 <4.3.0']),
    ];
  }

  private getModuleDefinition(
    name: string,
    supportedVersions: string[]
  ): InstrumentationNodeModuleDefinition {
    const apiModuleFiles = ['session', 'transaction'].map(
      (file) =>
        new InstrumentationNodeModuleFile(
          `${name}/lib/${file}.js`,
          supportedVersions,
          (moduleExports) => {
            if (isWrapped(moduleExports.default.prototype.run)) {
              this._unwrap(moduleExports.default.prototype, 'run');
            }

            this.patchSessionOrTransaction(moduleExports);

            return moduleExports;
          },
          (moduleExports) => {
            if (isWrapped(moduleExports.default.prototype.run)) {
              this._unwrap(moduleExports.default.prototype, 'run');
            }
          }
        )
    );

    const module = new InstrumentationNodeModuleDefinition(
      name,
      supportedVersions,
      undefined,
      undefined,
      apiModuleFiles
    );

    return module;
  }

  private patchSessionOrTransaction(fileExport: {
    default: () => neo4j.Session | neo4j.Transaction;
  }) {
    const self = this;
    this._wrap(
      fileExport.default.prototype,
      'run',
      (originalRun: neo4j.Session['run']) => {
        return function (this: unknown, ...args: RunArgs) {
          if (self.getConfig().ignoreOrphanedSpans) {
            if (!trace.getSpan(context.active())) {
              return originalRun.apply(this, args);
            }
          }

          const connectionAttributes = getAttributesFromNeo4jSession(this);
          const query = args[0] as string;
          const operation = query.trim().split(/\s+/)[0];
          const span = self.tracer.startSpan(
            `${operation} ${connectionAttributes[ATTR_DB_NAMESPACE]}`,
            {
              attributes: {
                ...connectionAttributes,
                [ATTR_DB_SYSTEM_NAME]: 'neo4j',
                [ATTR_DB_OPERATION_NAME]: operation,
                [ATTR_DB_QUERY_TEXT]: query,
              },
              kind: SpanKind.CLIENT,
            }
          );
          let spanEnded = false;
          const endSpan = () => {
            if (spanEnded) return;

            span.end();
            spanEnded = true;
          };

          const patchObserver = (observer: neo4j.ResultObserver) => {
            const records: neo4j.Record[] = [];
            return {
              ...observer,
              onKeys: function (
                this: unknown,
                ...args: Parameters<NonNullable<neo4j.ResultObserver['onKeys']>>
              ) {
                if (!observer.onKeys) return;
                if (!observer.onCompleted) {
                  endSpan();
                }
                return observer.onKeys.apply(this, args);
              },
              onNext: function (
                this: unknown,
                ...args: Parameters<NonNullable<neo4j.ResultObserver['onNext']>>
              ) {
                if (self.getConfig().responseHook) {
                  records.push(args[0]);
                }
                if (observer.onNext) return observer.onNext.apply(this, args);
              },
              onCompleted: function patchedOnCompleted(
                this: unknown,
                ...args: Parameters<
                  NonNullable<neo4j.ResultObserver['onCompleted']>
                >
              ) {
                const responseHook = self.getConfig().responseHook;
                if (responseHook) {
                  safeExecuteInTheMiddle(
                    () =>
                      responseHook(span, {
                        records: records,
                        summary: args[0],
                      }),
                    (e) => {
                      if (e) {
                        diag.error('responseHook error', e);
                      }
                    },
                    true
                  );
                }
                endSpan();
                if (observer.onCompleted)
                  return observer.onCompleted.apply(this, args);
              },
              onError: function (
                this: unknown,
                ...args: Parameters<
                  NonNullable<neo4j.ResultObserver['onError']>
                >
              ) {
                const err = args[0];
                span.recordException(err);
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: err.message,
                });
                endSpan();
                if (observer.onError) return observer.onError.apply(this, args);
              },
            };
          };

          const response: neo4j.Result = originalRun.apply(this, args);

          // Necessary for neo4j 5.x
          if (typeof response._decorateObserver === 'function') {
            const originalDecorate = response._decorateObserver;

            response._decorateObserver = function patchedDecorate(
              originalObserver
            ) {
              const observer = originalDecorate.call(
                response,
                originalObserver
              );
              return patchObserver(observer);
            };
          }

          const originalSubscribe = response.subscribe;
          response.subscribe = function (observer) {
            return originalSubscribe.call(this, patchObserver(observer));
          };

          return response;
        };
      }
    );
    return fileExport;
  }
}
