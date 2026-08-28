/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { performance } from 'perf_hooks';

import {
  SpanKind,
  SpanStatusCode,
  context,
  trace,
  type Attributes,
  type Context,
  type Histogram,
  type Span,
} from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';

import type {
  ClaudeAgentSDKModule,
  Query,
  QueryFunction,
  QueryParameters,
  SDKMessage,
} from './internal-types';
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  METRIC_GEN_AI_EXECUTE_TOOL_DURATION,
  METRIC_GEN_AI_INVOKE_AGENT_DURATION,
  METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS,
} from './semconv';
import {
  ToolSpanTracker,
  getInvocationInfo,
  getResultAttributes,
  getResultError,
  getSystemAttributes,
  isResultMessage,
  isSystemInitMessage,
  mergeToolHooks,
} from './telemetry';
import type { ClaudeAgentSDKInstrumentationConfig } from './types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

const SUPPORTED_VERSIONS = ['>=0.2.50 <1'];

interface InvocationState {
  span: Span;
  context: Context;
  tracker: ToolSpanTracker;
  startedAt: number;
  agentName: string;
  configuredModel?: string;
  contentCapture?: import('./content').ContentCapture;
  options?: import('./internal-types').Options;
  pendingError?: { type: string; message: string };
  endOnResult: boolean;
  ended: boolean;
}

export class ClaudeAgentSDKInstrumentation extends InstrumentationBase<ClaudeAgentSDKInstrumentationConfig> {
  private readonly _moduleCopies = new WeakMap<
    ClaudeAgentSDKModule,
    ClaudeAgentSDKModule
  >();
  private readonly _manualModules = new Set<ClaudeAgentSDKModule>();
  private _agentDuration!: Histogram;
  private _agentToolCalls!: Histogram;
  private _toolDuration!: Histogram;

  constructor(config: ClaudeAgentSDKInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    const captureFromEnvironment = getBooleanEnvironmentValue();
    if (captureFromEnvironment !== undefined) {
      this.getConfig().captureMessageContent = captureFromEnvironment;
    }
  }

  override setConfig(config: ClaudeAgentSDKInstrumentationConfig = {}): void {
    super.setConfig({
      ...config,
      captureMessageContent: !!config.captureMessageContent,
    });
  }

  protected init() {
    return new InstrumentationNodeModuleDefinition(
      '@anthropic-ai/claude-agent-sdk',
      SUPPORTED_VERSIONS,
      this._patch.bind(this),
      this._unpatch.bind(this)
    );
  }

  manuallyInstrument<T extends object>(module: T): T {
    const sdkModule = module as ClaudeAgentSDKModule;
    const patched = this._patch(sdkModule);
    this._manualModules.add(sdkModule);
    return patched as T;
  }

  override disable(): void {
    super.disable();
    for (const module of this._manualModules) {
      this._unpatch(module);
    }
    this._manualModules.clear();
  }

  override _updateMetricInstruments(): void {
    this._agentDuration = this.meter.createHistogram(
      METRIC_GEN_AI_INVOKE_AGENT_DURATION,
      {
        description: 'End-to-end duration of a GenAI agent invocation',
        unit: 's',
        advice: {
          explicitBucketBoundaries: [
            0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.4, 12.8, 25.6, 51.2, 102.4, 204.8,
            409.6,
          ],
        },
      }
    );
    this._agentToolCalls = this.meter.createHistogram(
      METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS,
      {
        description: 'Number of tool calls made by a GenAI agent invocation',
        unit: '{tool_call}',
        advice: {
          explicitBucketBoundaries: [0, 1, 2, 4, 8, 16, 32, 64, 128],
        },
      }
    );
    this._toolDuration = this.meter.createHistogram(
      METRIC_GEN_AI_EXECUTE_TOOL_DURATION,
      {
        description: 'Duration of a GenAI tool execution',
        unit: 's',
        advice: {
          explicitBucketBoundaries: [
            0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24,
            20.48, 40.96, 81.92,
          ],
        },
      }
    );
  }

  private _patch(
    module: ClaudeAgentSDKModule,
    moduleVersion?: string
  ): ClaudeAgentSDKModule {
    const sdkModule = getSDKModule(module);
    const existingCopy = this._moduleCopies.get(sdkModule);
    if (existingCopy) {
      return sdkModule === module ? existingCopy : module;
    }
    if (typeof sdkModule.query !== 'function') {
      this._diag.debug(
        `cannot find query export in @anthropic-ai/claude-agent-sdk@${moduleVersion}`
      );
      return module;
    }

    const target = isPropertyWritable(sdkModule, 'query')
      ? sdkModule
      : { ...sdkModule };
    if (!isWrapped(target.query)) {
      this._wrap(target, 'query', this._getQueryPatch());
    }
    if (target !== sdkModule) {
      this._moduleCopies.set(sdkModule, target);
    }
    if (sdkModule === module) {
      return target;
    }
    return target === sdkModule ? module : { ...module, default: target };
  }

  private _unpatch(module: ClaudeAgentSDKModule, moduleVersion?: string): void {
    const sdkModule = getSDKModule(module);
    const target = this._moduleCopies.get(sdkModule) ?? sdkModule;
    if (typeof target.query !== 'function') {
      this._diag.debug(
        `Claude Agent SDK module was not patched: ${moduleVersion}`
      );
      return;
    }
    if (isWrapped(target.query)) {
      this._unwrap(target, 'query');
    }
    this._moduleCopies.delete(sdkModule);
  }

  private _getQueryPatch() {
    const instrumentation = this;
    return (original: QueryFunction | undefined): QueryFunction | undefined => {
      if (!original) {
        return original;
      }
      return function patchedQuery(
        this: unknown,
        parameters: QueryParameters
      ): Query {
        const activeContext = context.active();
        if (
          !instrumentation.isEnabled() ||
          isTracingSuppressed(activeContext)
        ) {
          return original.apply(this, [parameters]);
        }

        const config = instrumentation.getConfig();
        const info = getInvocationInfo({
          prompt: parameters.prompt,
          options: parameters.options,
          captureMessageContent: !!config.captureMessageContent,
          diag: instrumentation._diag,
        });
        const span = instrumentation.tracer.startSpan(
          `invoke_agent ${info.agentName}`,
          {
            kind: SpanKind.INTERNAL,
            attributes: info.attributes,
          },
          activeContext
        );
        const spanContext = trace.setSpan(activeContext, span);
        const tracker = new ToolSpanTracker(
          instrumentation.tracer,
          spanContext,
          info.agentName,
          !!config.captureMessageContent,
          instrumentation._toolDuration,
          instrumentation._diag
        );
        const options = mergeToolHooks(parameters.options, tracker);
        const state: InvocationState = {
          span,
          context: spanContext,
          tracker,
          startedAt: performance.now(),
          agentName: info.agentName,
          configuredModel: info.configuredModel,
          contentCapture: info.contentCapture,
          options,
          endOnResult: typeof parameters.prompt === 'string',
          ended: false,
        };

        let query: Query;
        try {
          query = context.with(spanContext, () =>
            original.apply(this, [
              {
                ...parameters,
                prompt:
                  info.contentCapture?.wrapPrompt(parameters.prompt) ??
                  parameters.prompt,
                options,
              },
            ])
          );
        } catch (error) {
          instrumentation._finishWithException(state, error);
          throw error;
        }

        instrumentation._observeQuery(query, state);
        return query;
      };
    };
  }

  private _observeQuery(query: Query, state: InvocationState): void {
    const instrumentation = this;
    try {
      this._wrap(query, 'next', original => {
        return function patchedNext(
          this: Query,
          ...args: Parameters<Query['next']>
        ) {
          let result: ReturnType<Query['next']>;
          try {
            result = context.with(state.context, () =>
              original.apply(this, args)
            );
          } catch (error) {
            instrumentation._finishWithException(state, error);
            throw error;
          }
          return result.then(
            next => {
              if (next.done) {
                instrumentation._finish(state);
              } else {
                instrumentation._observeMessage(next.value, state);
              }
              return next;
            },
            error => {
              instrumentation._finishWithException(state, error);
              throw error;
            }
          );
        };
      });
      this._wrap(query, 'return', original => {
        return function patchedReturn(
          this: Query,
          ...args: Parameters<Query['return']>
        ) {
          const result = context.with(state.context, () =>
            original.apply(this, args)
          );
          return result.then(
            returned => {
              instrumentation._finish(state);
              return returned;
            },
            error => {
              instrumentation._finishWithException(state, error);
              throw error;
            }
          );
        };
      });
      this._wrap(query, 'throw', original => {
        return function patchedThrow(
          this: Query,
          ...args: Parameters<Query['throw']>
        ) {
          const result = context.with(state.context, () =>
            original.apply(this, args)
          );
          return result.then(
            thrown => {
              if (thrown.done) {
                instrumentation._finish(state);
              } else {
                instrumentation._observeMessage(thrown.value, state);
              }
              return thrown;
            },
            error => {
              instrumentation._finishWithException(state, error);
              throw error;
            }
          );
        };
      });
      if (typeof query.close === 'function') {
        this._wrap(query, 'close', original => {
          return function patchedClose(this: Query) {
            try {
              const result = original.apply(this);
              instrumentation._finish(state);
              return result;
            } catch (error) {
              instrumentation._finishWithException(state, error);
              throw error;
            }
          };
        });
      }
    } catch (error) {
      this._diag.error('failed to observe Claude Agent SDK Query', error);
      this._finish(state);
    }
  }

  private _observeMessage(message: SDKMessage, state: InvocationState): void {
    state.contentCapture?.recordMessage(message);
    if (state.contentCapture) {
      state.span.setAttributes(
        state.contentCapture.getAttributes(state.options)
      );
    }
    if (isSystemInitMessage(message)) {
      state.span.setAttributes(
        getSystemAttributes(message, state.configuredModel)
      );
    } else if (message.type === 'assistant' && message.error) {
      state.pendingError = { type: message.error, message: message.error };
    } else if (isResultMessage(message)) {
      state.span.setAttributes(getResultAttributes(message));
      state.pendingError =
        message.subtype === 'success' ? undefined : getResultError(message);
      if (state.endOnResult) {
        this._finish(state);
      }
    }
  }

  private _finish(state: InvocationState): void {
    if (!this._beginFinish(state)) {
      return;
    }
    if (state.pendingError) {
      state.span.setAttribute(ATTR_ERROR_TYPE, state.pendingError.type);
      state.span.setStatus({
        code: SpanStatusCode.ERROR,
        message: state.pendingError.message,
      });
    }
    state.span.end();
    this._recordInvocationMetrics(state, state.pendingError?.type);
  }

  private _finishWithException(state: InvocationState, error: unknown): void {
    if (!this._beginFinish(state)) {
      return;
    }
    const exception = error instanceof Error ? error : new Error(String(error));
    state.span.recordException(exception);
    state.span.setAttribute(ATTR_ERROR_TYPE, exception.name);
    state.span.setStatus({
      code: SpanStatusCode.ERROR,
      message: exception.message,
    });
    state.span.end();
    this._recordInvocationMetrics(state, exception.name);
  }

  private _beginFinish(state: InvocationState): boolean {
    if (state.ended) {
      return false;
    }
    state.ended = true;
    state.tracker.close();
    return true;
  }

  private _recordInvocationMetrics(
    state: InvocationState,
    errorType?: string
  ): void {
    const attributes: Attributes = {
      [ATTR_GEN_AI_AGENT_NAME]: state.agentName,
    };
    if (state.configuredModel) {
      attributes[ATTR_GEN_AI_REQUEST_MODEL] = state.configuredModel;
    }
    if (errorType) {
      attributes[ATTR_ERROR_TYPE] = errorType;
    }
    this._agentDuration.record(
      (performance.now() - state.startedAt) / 1000,
      attributes
    );
    this._agentToolCalls.record(state.tracker.startedCount, attributes);
  }
}

function getSDKModule(module: ClaudeAgentSDKModule): ClaudeAgentSDKModule {
  return module.default ?? module;
}

function isPropertyWritable<T extends object>(
  object: T,
  property: keyof T
): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(object, property);
  return (
    descriptor === undefined ||
    descriptor.writable === true ||
    typeof descriptor.set === 'function'
  );
}

function getBooleanEnvironmentValue(): boolean | undefined {
  const value = process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
  if (value === undefined) {
    return undefined;
  }
  return value.toLowerCase() === 'true';
}
