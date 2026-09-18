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
import type { CallbackManager } from '@langchain/core/callbacks/manager';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
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
import { createAgentUsageHandler } from './agent-usage';
import { createAgentStreamAccumulator } from './agent-stream';
import { observeStream } from './stream-lifecycle';
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
const ACTIVE_AGENT = createContextKey('opentelemetry.langchain.agent');
const SUPPORTED_VERSIONS = ['>=1.0.0 <2'];
interface OperationState {
  target: object;
  span: Span;
  ctx: Context;
  capture: boolean;
  operation: Operation;
  ended: boolean;
  streaming: boolean;
  outputValid: boolean;
  agentStream?: ReturnType<typeof createAgentStreamAccumulator>;
  usageHandler?: BaseCallbackHandler;
  agentName?: string;
  output?: unknown;
}

interface SourceCompletion {
  completed: boolean;
  failed: boolean;
  error?: unknown;
}

interface EventStreamModule {
  toEventStream(stream: object): ReadableStream<Uint8Array>;
}

function isIterator(
  value: unknown
): value is AsyncIterator<unknown, unknown, unknown> {
  return isRecord(value) && typeof value.next === 'function';
}

function instrumentModuleInstances<T extends object>(
  name: string,
  patch: (module: T) => void,
  unpatch: (module: T) => void
): InstrumentationNodeModuleFile {
  // Keep every loaded copy, including imports made while patching is disabled.
  const instances = new Set<T>();
  const file = new InstrumentationNodeModuleFile(
    name,
    SUPPORTED_VERSIONS,
    (module: T) => {
      instances.add(module);
      for (const instance of instances) patch(instance);
      return module;
    },
    () => {
      for (const instance of instances) unpatch(instance);
    }
  );
  let exports: T | undefined;
  Object.defineProperty(file, 'moduleExports', {
    get: () => exports,
    set: (module: T) => {
      exports = module;
      instances.add(module);
    },
  });
  return file;
}

export class LangChainInstrumentation extends InstrumentationBase<LangChainInstrumentationConfig> {
  declare private _streamSources?: WeakMap<object, Promise<SourceCompletion>>;
  declare private _readerSources?: WeakMap<object, Promise<SourceCompletion>>;

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
          instrumentModuleInstances(
            `@langchain/core/dist/callbacks/manager.${extension}`,
            (module: { CallbackManager: typeof CallbackManager }) => {
              const self = this;
              this._wrap(module.CallbackManager, '_configureSync', original => {
                return function (this: typeof CallbackManager, ...args) {
                  const manager = original.apply(this, args);
                  const state = context.active().getValue(ACTIVE_AGENT) as
                    | OperationState
                    | undefined;
                  if (!state || state.ended) return manager;
                  try {
                    const handler = (state.usageHandler ??=
                      createAgentUsageHandler(state.span, self._diag, this));
                    if (
                      manager?.handlers.some(item => item.name === handler.name)
                    ) {
                      return manager;
                    }
                    const copy = manager ? manager.copy() : new this();
                    copy.addHandler(handler, true);
                    return copy;
                  } catch {
                    self._diag.warn(
                      'LangChain: could not observe agent usage callbacks'
                    );
                    return manager;
                  }
                };
              });
            },
            (module: { CallbackManager: typeof CallbackManager }) => {
              this._unwrap(module.CallbackManager, '_configureSync');
            }
          ),
          instrumentModuleInstances(
            `@langchain/core/dist/runnables/base.${extension}`,
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
          instrumentModuleInstances(
            `@langchain/core/dist/tools/index.${extension}`,
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
          instrumentModuleInstances(
            `@langchain/core/dist/utils/stream.${extension}`,
            (module: typeof Streams) => {
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
                    const completion =
                      state?.streaming && !state.ended
                        ? self._bindIterator(generator, state.ctx)
                        : undefined;
                    const stream = (original<T>).call(this, generator);
                    if (completion) {
                      self._trackStreamSource(stream, completion);
                    }
                    return stream;
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
        '@langchain/langgraph',
        SUPPORTED_VERSIONS,
        undefined,
        undefined,
        ['cjs', 'js'].map(extension =>
          instrumentModuleInstances(
            `@langchain/langgraph/dist/pregel/stream.${extension}`,
            (module: EventStreamModule) => {
              const self = this;
              this._wrap(module, 'toEventStream', original => {
                return function (this: EventStreamModule, stream: object) {
                  const encoded = original.call(this, stream);
                  const source = self._streamSource(stream);
                  if (source) self._trackStreamSource(encoded, source);
                  return encoded;
                };
              });
            },
            (module: EventStreamModule) => {
              this._unwrap(module, 'toEventStream');
            }
          )
        )
      ),
      new InstrumentationNodeModuleDefinition(
        'langchain',
        SUPPORTED_VERSIONS,
        undefined,
        undefined,
        ['cjs', 'js'].map(extension =>
          instrumentModuleInstances(
            `langchain/dist/agents/ReactAgent.${extension}`,
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
            streaming,
            outputValid: true,
            agentStream:
              capture &&
              streaming &&
              operation === GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
                ? createAgentStreamAccumulator(args[1])
                : undefined,
            agentName:
              typeof attributes[ATTR_GEN_AI_AGENT_NAME] === 'string'
                ? attributes[ATTR_GEN_AI_AGENT_NAME]
                : active?.agentName,
          };
          state.ctx = trace
            .setSpan(parent, span)
            .setValue(ACTIVE_OPERATION, state);
          if (operation === GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT) {
            state.ctx = state.ctx.setValue(ACTIVE_AGENT, state);
          }
        } catch {
          self._diag.warn('LangChain: could not start operation telemetry');
          return original.apply(this, args);
        }
        let result: R;
        try {
          result = context.with(state.ctx, () => original.apply(this, args));
        } catch (error) {
          self._end(state, undefined, error, true);
          throw error;
        }
        const completed = (value: unknown) => {
          try {
            if (
              streaming &&
              (isIterator(value) || value instanceof ReadableStream)
            ) {
              observeStream(value, {
                context: state.ctx,
                diag: self._diag,
                sourceCompletion: self._streamSource(value),
                onChunk: chunk => self._recordChunk(state, chunk),
                onEnd: (consumed, error, failed) =>
                  self._end(
                    state,
                    consumed && state.outputValid ? state.output : undefined,
                    error,
                    failed
                  ),
              });
            } else {
              self._end(state, value);
            }
          } catch {
            self._diag.warn('LangChain: could not observe operation result');
            self._end(state);
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

  private _bindIterator(
    iterator: AsyncIterator<unknown, unknown, unknown>,
    ctx: Context
  ): Promise<SourceCompletion> {
    let complete!: (result: SourceCompletion) => void;
    const completion = new Promise<SourceCompletion>(resolve => {
      complete = resolve;
    });
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
              result = context.with(ctx, () => original.apply(iterator, args));
            } catch (error) {
              complete({ completed: false, failed: true, error });
              throw error;
            }
            void result.then(
              value => {
                if (method !== 'next' || value.done) {
                  complete({ completed: method === 'next', failed: false });
                }
              },
              error => complete({ completed: false, failed: true, error })
            );
            return result;
          }
      );
    }
    return completion;
  }

  private _trackStreamSource<T>(
    stream: ReadableStream<T>,
    completion: Promise<SourceCompletion>
  ) {
    (this._streamSources ??= new WeakMap()).set(stream, completion);
    const readers = (this._readerSources ??= new WeakMap());
    this._wrap(
      stream,
      'getReader',
      original =>
        new Proxy(original.bind(stream), {
          apply(_target, receiver, args) {
            const reader: object = Reflect.apply(original, receiver, args);
            if (receiver === stream) readers.set(reader, completion);
            return reader;
          },
        })
    );
  }

  private _streamSource(stream: object): Promise<SourceCompletion> | undefined {
    const source = this._streamSources?.get(stream);
    if (source) return source;
    // LangGraph's abortable public stream pumps from this SDK source reader.
    if ('_innerReader' in stream && isRecord(stream._innerReader)) {
      return this._readerSources?.get(stream._innerReader);
    }
    return undefined;
  }

  private _recordChunk(state: OperationState, chunk: unknown) {
    if (!state.capture || !state.outputValid) return;
    try {
      if (state.agentStream) {
        state.agentStream.add(chunk);
        state.output = state.agentStream.output();
      } else if (state.output === undefined) {
        state.output = chunk;
      } else if (
        '_concatOutputChunks' in state.target &&
        typeof state.target._concatOutputChunks === 'function'
      ) {
        state.output = state.target._concatOutputChunks(state.output, chunk);
      } else {
        throw new Error('LangChain stream concatenation is unavailable');
      }
    } catch {
      this._diag.debug(
        'LangChain: streamed output cannot be combined; omitting content'
      );
      state.outputValid = false;
      state.output = undefined;
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
      try {
        state.span.end();
      } catch {
        this._diag.warn('LangChain: could not end operation span');
      }
    }
  }
}
