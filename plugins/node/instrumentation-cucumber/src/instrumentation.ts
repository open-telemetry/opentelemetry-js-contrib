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

import { Span, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

import type * as cucumber from '@cucumber/cucumber';
import * as messages from '@cucumber/messages';
import type TestCaseRunner from '@cucumber/cucumber/lib/runtime/test_case_runner';
import type {
  DefineStepPattern,
  IDefineStepOptions,
  IDefineTestRunHookOptions,
} from '@cucumber/cucumber/lib/support_code_library_builder/types';

import { AttributeNames, CucumberInstrumentationConfig } from './types';
import { VERSION } from './version';

const hooks = ['Before', 'BeforeStep', 'AfterStep', 'After'] as const;
const steps = ['Given', 'When', 'Then'] as const;
type Cucumber = typeof cucumber;
type Hook = typeof hooks[number];
type Step = typeof steps[number];

export class CucumberInstrumentation extends InstrumentationBase {
  constructor(config: CucumberInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-cucumber', VERSION, config);
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition<Cucumber>(
        '@cucumber/cucumber',
        ['^8.0.0'],
        (moduleExports, moduleVersion) => {
          this._diag.debug(
            `Applying patch for @cucumber/cucumber@${moduleVersion}`
          );
          steps.forEach(step => {
            if (isWrapped(moduleExports[step])) {
              this._unwrap(moduleExports, step);
            }
            this._wrap(moduleExports, step, this._getStepPatch(step));
          });
          hooks.forEach(hook => {
            if (isWrapped(moduleExports[hook])) {
              this._unwrap(moduleExports, hook);
            }
            this._wrap(moduleExports, hook, this._getHookPatch(hook));
          });
          return moduleExports;
        },
        (moduleExports, moduleVersion) => {
          if (moduleExports === undefined) return;
          this._diag.debug(
            `Removing patch for @cucumber/cucumber@${moduleVersion}`
          );
          [...hooks, ...steps].forEach(method => {
            this._unwrap(moduleExports, method);
          });
        },
        [
          new InstrumentationNodeModuleFile<{
            default: { new (): TestCaseRunner; prototype: TestCaseRunner };
          }>(
            '@cucumber/cucumber/lib/runtime/test_case_runner.js',
            ['^8.0.0'],
            (moduleExports, moduleVersion) => {
              this._diag.debug(
                `Applying patch for @cucumber/cucumber/lib/runtime/test_case_runner.js@${moduleVersion}`
              );
              if (isWrapped(moduleExports.default.prototype.run)) {
                this._unwrap(moduleExports.default.prototype, 'run');
                this._unwrap(moduleExports.default.prototype, 'runStep');
              }
              this._wrap(
                moduleExports.default.prototype,
                'run',
                this._getTestCaseRunPatch()
              );
              this._wrap(
                moduleExports.default.prototype,
                'runStep',
                this._getTestCaseRunStepPatch()
              );
              return moduleExports;
            },
            (moduleExports, moduleVersion) => {
              if (moduleExports === undefined) return;
              this._diag.debug(
                `Removing patch for @cucumber/cucumber/lib/runtime/test_case_runner.js@${moduleVersion}`
              );
              this._unwrap(moduleExports.default.prototype, 'run');
              this._unwrap(moduleExports.default.prototype, 'runStep');
            }
          ),
        ]
      ),
    ];
  }

  private static mapTags(tags: readonly messages.Tag[]): string[] {
    return tags.map(tag => tag.name);
  }

  private static setSpanToError(span: Span, error: any) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error?.message ?? error,
    });
  }

  private static setSpanToStepStatus(
    span: Span,
    status: messages.TestStepResultStatus,
    context?: string
  ) {
    if (
      [
        messages.TestStepResultStatus.UNDEFINED,
        messages.TestStepResultStatus.AMBIGUOUS,
        messages.TestStepResultStatus.FAILED,
      ].includes(status)
    ) {
      span.recordException(status);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: context || status,
      });
    }
    if (
      [
        messages.TestStepResultStatus.SKIPPED,
        messages.TestStepResultStatus.PENDING,
      ].includes(status)
    ) {
      span.addEvent(status);
    }
  }

  private _getTestCaseRunPatch() {
    const instrumentation = this;
    return function (original: TestCaseRunner['run']): TestCaseRunner['run'] {
      return async function (this: TestCaseRunner, ...args) {
        if (!instrumentation.isEnabled()) return original.apply(this, args);

        const gherkinDocument = this[
          'gherkinDocument'
        ] as Required<messages.GherkinDocument>;
        const { feature } = gherkinDocument;
        const pickle = this['pickle'] as messages.Pickle;
        const scenario = feature.children.find(
          node => node?.scenario?.id === pickle.astNodeIds[0]
        )?.scenario as messages.Scenario;

        return instrumentation.tracer.startActiveSpan(
          `Feature: ${feature.name}\nScenario: ${pickle.name}`,
          {
            kind: SpanKind.CLIENT,
            attributes: {
              [SemanticAttributes.CODE_FILEPATH]: gherkinDocument.uri,
              [SemanticAttributes.CODE_LINENO]: scenario.location.line,
              [SemanticAttributes.CODE_FUNCTION]: scenario.name,
              [SemanticAttributes.CODE_NAMESPACE]: feature.name,
              [AttributeNames.FEATURE_TAGS]: CucumberInstrumentation.mapTags(
                feature.tags
              ),
              [AttributeNames.FEATURE_LANGUAGE]: feature.language,
              [AttributeNames.FEATURE_DESCRIPTION]: feature.description,
              [AttributeNames.SCENARIO_TAGS]: CucumberInstrumentation.mapTags(
                scenario.tags
              ),
              [AttributeNames.SCENARIO_DESCRIPTION]: scenario.description,
            },
          },
          async span => {
            try {
              const status = await original.apply(this, args);
              CucumberInstrumentation.setSpanToStepStatus(span, status);
              return status;
            } catch (error: any) {
              CucumberInstrumentation.setSpanToError(span, error);
              throw error;
            } finally {
              span.end();
            }
          }
        );
      };
    };
  }

  private _getTestCaseRunStepPatch() {
    const instrumentation = this;
    return function (
      original: TestCaseRunner['runStep']
    ): TestCaseRunner['runStep'] {
      return async function (
        this: TestCaseRunner,
        ...args
      ): Promise<messages.TestStepResult> {
        if (!instrumentation.isEnabled()) return original.apply(this, args);

        const [pickleStep] = args;
        return instrumentation.tracer.startActiveSpan(
          pickleStep.text,
          {
            kind: SpanKind.CLIENT,
            attributes: {
              [AttributeNames.STEP_TYPE]: pickleStep.type,
            },
          },
          async span => {
            try {
              const result = await original.apply(this, args);
              CucumberInstrumentation.setSpanToStepStatus(
                span,
                result.status,
                result.message
              );
              return result;
            } catch (error) {
              CucumberInstrumentation.setSpanToError(span, error);
              throw error;
            } finally {
              span.end();
            }
          }
        );
      };
    };
  }

  private _getHookPatch<H extends Hook>(name: H) {
    const instrumentation = this;
    return function (original: Cucumber[H]): Cucumber[H] {
      return function (
        this: {},
        tagsOrOptions: string | IDefineTestRunHookOptions | Function,
        code?: Function
      ) {
        if (typeof tagsOrOptions === 'function') {
          code = tagsOrOptions;
          tagsOrOptions = {};
        }

        function traceableCode(
          this: cucumber.IWorld,
          arg: cucumber.ITestCaseHookParameter
        ) {
          if (!instrumentation.isEnabled()) return code?.call(this, arg);

          return instrumentation.tracer.startActiveSpan(
            name,
            {
              kind: SpanKind.CLIENT,
            },
            async span => {
              try {
                return await code?.call(this, arg);
              } catch (error: any) {
                this.attach?.(JSON.stringify(span.spanContext()));
                CucumberInstrumentation.setSpanToError(span, error);
                throw error;
              } finally {
                span.end();
              }
            }
          );
        }
        return original.call(this, tagsOrOptions as any, traceableCode as any);
      };
    };
  }

  private _getStepPatch<S extends Step>(name: S) {
    const instrumentation = this;
    return function (original: Cucumber[S]): Cucumber[S] {
      return function (
        this: {},
        pattern: DefineStepPattern,
        options: IDefineStepOptions | Function,
        code?: Function
      ): void {
        if (typeof options === 'function') {
          code = options;
          options = {};
        }

        function traceableCode(this: cucumber.IWorld, ...args: any[]) {
          if (!instrumentation.isEnabled()) return code?.apply(this, args);

          return instrumentation.tracer.startActiveSpan(
            `${name}(${pattern.toString()})`,
            {
              kind: SpanKind.CLIENT,
              // ignore the last argument because it's a callback
              attributes: args.slice(0, -1).reduce(
                (attrs, arg, index) => ({
                  ...attrs,
                  [`${AttributeNames.STEP_ARGS}[${index}]`]:
                    arg?.raw instanceof Function
                      ? JSON.stringify(arg.raw())
                      : arg,
                }),
                {}
              ),
            },
            async span => {
              try {
                return await code?.apply(this, args);
              } catch (error: any) {
                this.attach?.(JSON.stringify(span.spanContext()));
                CucumberInstrumentation.setSpanToError(span, error);
                throw error;
              } finally {
                span.end();
              }
            }
          );
        }
        // cucumber asks for the number of arguments to match the specified pattern
        // copy the value from the original function
        Object.defineProperty(traceableCode, 'length', {
          value: code?.length,
        });
        return original.call(this, pattern, options, traceableCode as any);
      };
    };
  }
}
