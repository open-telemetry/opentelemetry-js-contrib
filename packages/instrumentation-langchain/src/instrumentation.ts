/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import {
  context,
  createContextKey,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import type { Attributes, Context, Span } from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import type { Runnable, RunnableConfig } from '@langchain/core/runnables';
import type { StructuredTool } from '@langchain/core/tools';
import type { createAgent } from 'langchain';
import type * as Runnables from '@langchain/core/runnables';
import type * as Tools from '@langchain/core/tools';
import type * as Streams from '@langchain/core/utils/stream';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { LangChainInstrumentationConfig } from './types';
import {
  agentOutput,
  isRecord,
  messages,
  systemInstructions,
  toolContent,
} from './content';
import { agentUsageCallbacks } from './agent-usage';
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_DESCRIPTION,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_TYPE,
  ATTR_GEN_AI_WORKFLOW_NAME,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
} from './semconv';

type Agent = ReturnType<typeof createAgent>;
type Operation = 'invoke_workflow' | 'invoke_agent' | 'execute_tool';
const ACTIVE_OPERATION = createContextKey('opentelemetry.langchain.operation');
const SUPPORTED_VERSIONS = ['>=1.0.0 <2'];
interface OperationState {
  target: object;
  span: Span;
  ctx: Context;
  capture: boolean;
  operation: Operation;
  ended: boolean;
  observingStream: boolean;
  streaming: boolean;
  outputValid: boolean;
  agentName?: string;
  output?: unknown;
}

function isIterator(
  value: unknown
): value is AsyncIterator<unknown, unknown, unknown> {
  return isRecord(value) && typeof value.next === 'function';
}

export class LangChainInstrumentation extends InstrumentationBase<LangChainInstrumentationConfig> {
  declare private _concat?: typeof Streams.concat;

  constructor(config: LangChainInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    const env = process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
    if (env) {
      if (/^(true|false)$/i.test(env)) {
        this.setConfig({
          ...this.getConfig(),
          captureMessageContent: env.toLowerCase() === 'true',
        });
      } else {
        this._diag.warn(
          'Invalid OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT; ignoring'
        );
      }
    }
  }

  // Override InstrumentationAbstract.setConfig so we can normalize config.
  override setConfig(config: LangChainInstrumentationConfig = {}) {
    const { captureMessageContent, ...validConfig } = config;
    (validConfig as LangChainInstrumentationConfig).captureMessageContent =
      !!captureMessageContent;
    super.setConfig(validConfig);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition(
        '@langchain/core',
        SUPPORTED_VERSIONS,
        undefined,
        undefined,
        ['cjs', 'js'].flatMap(extension => [
          new InstrumentationNodeModuleFile(
            `@langchain/core/dist/runnables/base.${extension}`,
            SUPPORTED_VERSIONS,
            (module: typeof Runnables) => {
              for (const cls of [module.RunnableSequence, module.RunnableMap]) {
                this._patchBoundary(
                  cls.prototype,
                  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW
                );
              }
              this._wrap(
                module.RunnableSequence.prototype,
                'batch',
                this._wrapper(
                  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
                  false
                )
              );
              return module;
            },
            (module: typeof Runnables | undefined) => {
              if (module) {
                for (const cls of [
                  module.RunnableSequence,
                  module.RunnableMap,
                ]) {
                  this._unpatchBoundary(cls.prototype);
                }
                this._unwrap(module.RunnableSequence.prototype, 'batch');
              }
            }
          ),
          new InstrumentationNodeModuleFile(
            `@langchain/core/dist/tools/index.${extension}`,
            SUPPORTED_VERSIONS,
            (module: typeof Tools) => {
              this._patchBoundary(
                module.StructuredTool.prototype,
                GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL
              );
              this._wrap(
                module.StructuredTool.prototype,
                'call',
                this._wrapper(GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL, false)
              );
              return module;
            },
            (module: typeof Tools | undefined) => {
              if (module) {
                this._unpatchBoundary(module.StructuredTool.prototype);
                this._unwrap(module.StructuredTool.prototype, 'call');
              }
            }
          ),
          new InstrumentationNodeModuleFile(
            `@langchain/core/dist/utils/stream.${extension}`,
            SUPPORTED_VERSIONS,
            (module: typeof Streams) => {
              this._concat = module.concat;
              const self = this;
              this._wrap(
                module.IterableReadableStream,
                'fromAsyncGenerator',
                original => {
                  return function <T>(
                    this: typeof Streams.IterableReadableStream,
                    generator: AsyncGenerator<T>
                  ) {
                    const state = context
                      .active()
                      .getValue(ACTIVE_OPERATION) as OperationState | undefined;
                    if (
                      state?.streaming &&
                      !state.observingStream &&
                      !state.ended
                    ) {
                      self._observeIterator(generator, state);
                    }
                    return (original<T>).call(this, generator);
                  };
                }
              );
              return module;
            },
            (module: typeof Streams | undefined) => {
              if (module)
                this._unwrap(
                  module.IterableReadableStream,
                  'fromAsyncGenerator'
                );
            }
          ),
        ])
      ),
      new InstrumentationNodeModuleDefinition(
        'langchain',
        SUPPORTED_VERSIONS,
        undefined,
        undefined,
        ['cjs', 'js'].map(
          extension =>
            new InstrumentationNodeModuleFile(
              `langchain/dist/agents/ReactAgent.${extension}`,
              SUPPORTED_VERSIONS,
              (module: { ReactAgent: { prototype: Agent } }) => {
                this._patchBoundary(
                  module.ReactAgent.prototype,
                  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
                );
                return module;
              },
              (module: { ReactAgent: { prototype: Agent } } | undefined) => {
                if (module) this._unpatchBoundary(module.ReactAgent.prototype);
              }
            )
        )
      ),
    ];
  }

  private _patchBoundary(target: Runnable | Agent, operation: Operation) {
    this._wrap(target, 'invoke', this._wrapper(operation, false));
    this._wrap(target, 'stream', this._wrapper(operation, true));
  }

  private _unpatchBoundary(target: Runnable | Agent) {
    this._unwrap(target, 'invoke');
    this._unwrap(target, 'stream');
  }

  private _wrapper(operation: Operation, streaming: boolean) {
    const self = this;
    return <T extends object, A extends unknown[], R>(
      original: (this: T, ...args: A) => R
    ) =>
      function (this: T, ...args: A): R {
        const parent = context.active();
        const active = parent.getValue(ACTIVE_OPERATION) as
          | OperationState
          | undefined;
        // LangGraph marks its internal node/channel sequences with this flag.
        // They are implementation details, not application-defined workflows.
        const internalSequence =
          operation === GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW &&
          'omitSequenceTags' in this &&
          this.omitSequenceTags === true;
        // Early 1.x agents build a prompt/model adapter sequence at invocation
        // time. Do not expose that adapter as an application workflow.
        const config = args[1];
        const first =
          'steps' in this && Array.isArray(this.steps)
            ? this.steps[0]
            : undefined;
        const agentModelSequence =
          operation === GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW &&
          active?.operation === GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT &&
          (!isRecord(config) ||
            config.runName === undefined ||
            config.runName === 'model_request') &&
          !('name' in this && this.name) &&
          isRecord(first) &&
          isRecord(first.config) &&
          first.config.runName === 'prompt';
        if (
          !self.isEnabled() ||
          isTracingSuppressed(parent) ||
          active?.target === this ||
          internalSequence ||
          agentModelSequence
        ) {
          return original.apply(this, args);
        }
        let state: OperationState;
        try {
          const capture = !!self.getConfig().captureMessageContent;
          const attributes = self._attributes(
            this,
            operation,
            args[0],
            args[1],
            capture
          );
          const name =
            attributes[ATTR_GEN_AI_TOOL_NAME] ??
            attributes[ATTR_GEN_AI_AGENT_NAME] ??
            attributes[ATTR_GEN_AI_WORKFLOW_NAME];
          const span = self.tracer.startSpan(
            name ? `${operation} ${name}` : operation,
            {
              kind: SpanKind.INTERNAL,
              attributes,
            },
            parent
          );
          state = {
            target: this,
            span,
            ctx: parent,
            capture,
            operation,
            ended: false,
            observingStream: false,
            streaming,
            outputValid: true,
            agentName:
              typeof attributes[ATTR_GEN_AI_AGENT_NAME] === 'string'
                ? attributes[ATTR_GEN_AI_AGENT_NAME]
                : active?.agentName,
          };
          state.ctx = trace
            .setSpan(parent, span)
            .setValue(ACTIVE_OPERATION, state);
        } catch {
          self._diag.warn('LangChain: could not start operation telemetry');
          return original.apply(this, args);
        }
        const callArgs = [...args] as A;
        if (operation === GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT) {
          try {
            const options = (args[1] ?? {}) as RunnableConfig;
            callArgs[1] = {
              ...options,
              callbacks: agentUsageCallbacks(
                options.callbacks,
                state.span,
                self._diag
              ),
            };
          } catch {
            self._diag.warn(
              'LangChain: could not observe agent usage callbacks'
            );
          }
        }
        let result: R;
        try {
          result = context.with(state.ctx, () =>
            original.apply(this, callArgs)
          );
        } catch (error) {
          self._end(state, undefined, error, true);
          throw error;
        }
        const completed = (value: unknown) => {
          if (streaming && isIterator(value)) {
            if (!state.observingStream) self._observeIterator(value, state);
          } else {
            self._end(state, value);
          }
        };
        if (result instanceof Promise) {
          void result.then(completed, error =>
            self._end(state, undefined, error, true)
          );
        } else {
          completed(result);
        }
        return result;
      };
  }

  private _attributes(
    target: object,
    operation: Operation,
    input: unknown,
    options: unknown,
    capture: boolean
  ): Attributes {
    const attributes: Attributes = { [ATTR_GEN_AI_OPERATION_NAME]: operation };
    const config = isRecord(options) ? (options as RunnableConfig) : undefined;
    const conversation = [
      config?.configurable?.thread_id,
      config?.configurable?.session_id,
      config?.configurable?.conversation_id,
      config?.metadata?.session_id,
      config?.metadata?.thread_id,
      config?.metadata?.conversation_id,
    ].find(
      (value): value is string => typeof value === 'string' && value.length > 0
    );
    if (conversation !== undefined)
      attributes[ATTR_GEN_AI_CONVERSATION_ID] = conversation;
    if (operation === GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL) {
      const tool = target as StructuredTool;
      const active = context.active().getValue(ACTIVE_OPERATION) as
        | OperationState
        | undefined;
      if (active?.agentName)
        attributes[ATTR_GEN_AI_AGENT_NAME] = active.agentName;
      attributes[ATTR_GEN_AI_TOOL_NAME] = tool.name;
      attributes[ATTR_GEN_AI_TOOL_TYPE] = 'function';
      if (isRecord(input) && input.type === 'tool_call') {
        if (typeof input.id === 'string')
          attributes[ATTR_GEN_AI_TOOL_CALL_ID] = input.id;
        input = input.args;
      } else if (
        isRecord(options) &&
        isRecord(options.toolCall) &&
        typeof options.toolCall.id === 'string'
      ) {
        attributes[ATTR_GEN_AI_TOOL_CALL_ID] = options.toolCall.id;
      }
      if (capture) {
        attributes[ATTR_GEN_AI_TOOL_DESCRIPTION] = tool.description;
        attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS] = toolContent(input);
      }
    } else {
      if (operation === GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT) {
        const agent = target as Agent;
        attributes[ATTR_GEN_AI_AGENT_NAME] = agent.options.name;
        const model = agent.options.model;
        if (typeof model === 'string')
          attributes[ATTR_GEN_AI_REQUEST_MODEL] = model;
        else if ('model' in model && typeof model.model === 'string')
          attributes[ATTR_GEN_AI_REQUEST_MODEL] = model.model;
        if (capture) {
          attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] = systemInstructions(
            agent.options.systemPrompt,
            this._diag
          );
        }
      } else {
        const runnable = target as Runnable;
        attributes[ATTR_GEN_AI_WORKFLOW_NAME] =
          config?.runName ?? runnable.name ?? runnable.getName();
      }
      if (capture)
        attributes[ATTR_GEN_AI_INPUT_MESSAGES] = messages(input, this._diag);
    }
    return attributes;
  }

  private _observeIterator(
    iterator: AsyncIterator<unknown, unknown, unknown>,
    state: OperationState
  ) {
    state.observingStream = true;
    const self = this;
    for (const method of ['next', 'return', 'throw'] as const) {
      const original = iterator[method];
      if (!original) continue;
      this._wrap(
        iterator,
        method,
        () =>
          function (...args: [] | [unknown]) {
            let result: Promise<IteratorResult<unknown>>;
            try {
              result = context.with(state.ctx, () =>
                original.apply(iterator, args)
              );
            } catch (error) {
              self._end(state, undefined, error, true);
              throw error;
            }
            void result.then(
              chunk => {
                if (method !== 'next' || chunk.done) {
                  self._end(
                    state,
                    method === 'next' && state.outputValid
                      ? state.output
                      : undefined
                  );
                } else if (state.capture && state.outputValid) {
                  try {
                    if (state.output === undefined) {
                      state.output = chunk.value;
                    } else if (self._concat) {
                      state.output = self._concat(state.output, chunk.value);
                    } else {
                      self._diag.debug(
                        'LangChain: stream concatenation is unavailable; omitting content'
                      );
                      state.outputValid = false;
                      state.output = undefined;
                    }
                  } catch {
                    self._diag.debug(
                      'LangChain: streamed output cannot be combined; omitting content'
                    );
                    state.outputValid = false;
                    state.output = undefined;
                  }
                }
              },
              error => self._end(state, undefined, error, true)
            );
            return result;
          }
      );
    }
  }

  private _end(
    state: OperationState,
    output?: unknown,
    error?: unknown,
    failed = false
  ) {
    if (state.ended) return;
    state.ended = true;
    try {
      if (failed) {
        state.span.setStatus({ code: SpanStatusCode.ERROR });
        state.span.setAttribute(
          ATTR_ERROR_TYPE,
          error instanceof Error ? error.name : '_OTHER'
        );
      } else if (state.capture) {
        const tool =
          state.operation === GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL;
        if (state.operation === GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT) {
          output = agentOutput(output);
        }
        if (tool && isRecord(output) && 'tool_call_id' in output)
          output = output.content;
        const content = tool
          ? toolContent(output)
          : messages(output, this._diag, 'assistant');
        if (content !== undefined) {
          state.span.setAttribute(
            tool ? ATTR_GEN_AI_TOOL_CALL_RESULT : ATTR_GEN_AI_OUTPUT_MESSAGES,
            content
          );
        }
      }
    } catch {
      this._diag.warn('LangChain: could not extract operation telemetry');
    } finally {
      state.span.end();
    }
  }
}
