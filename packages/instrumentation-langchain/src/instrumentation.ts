/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  context,
  diag,
  trace,
  SpanKind,
  SpanStatusCode,
  type Attributes,
  type Context,
  type Histogram,
  type HrTime,
  type MeterProvider,
  type Span,
  type TracerProvider,
} from '@opentelemetry/api';
import {
  hrTime,
  hrTimeDuration,
  hrTimeToSeconds,
  isTracingSuppressed,
} from '@opentelemetry/core';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { TelemetryHandler } from '@opentelemetry/genai-util';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import {
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_WORKFLOW_NAME,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
  METRIC_GEN_AI_INVOKE_WORKFLOW_DURATION,
} from './semconv';
import type * as Runnables from '@langchain/core/runnables';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  CallbackManager,
  CallbackManagerForToolRun,
} from '@langchain/core/callbacks/manager';
import type { StructuredTool } from '@langchain/core/tools';
import type * as PregelModule from '@langchain/langgraph/pregel';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { LangChainInstrumentationConfig } from './types';
import { batchOutputMessages, isRecord, messages } from './content';
import { addToolCallbacks, getToolContext } from './tool-callbacks';
import { addGraphCallbacks, getGraphContext } from './graph-callbacks';
import {
  isInternalWorkflow,
  isTrackingFactory,
  markAgentGraph,
  markAgentPrompt,
  markAgentPromptComposition,
  markStructuredOutput,
  markWorkflow,
  ownValue,
  trackFactory,
  trackOwnedWorkflow,
} from './internal-workflows';

const MODULE_NAME = '@langchain/core';
const SUPPORTED_VERSIONS = ['>=1.0.0 <2'];

interface WorkflowPatch {
  owners: Set<LangChainInstrumentation>;
  restore: () => void;
}

const workflowPatches = new WeakMap<object, Map<PropertyKey, WorkflowPatch>>();

interface ToolExecutor {
  _call(
    input: unknown,
    runManager?: CallbackManagerForToolRun,
    config?: Runnables.RunnableConfig
  ): unknown;
}

function isToolExecutor(target: object): target is ToolExecutor {
  return '_call' in target && typeof target._call === 'function';
}

interface WorkflowState {
  span: Span;
  context: Context;
  startTime: HrTime;
  durationHistogram: Histogram | undefined;
  metricAttributes: Attributes;
  capture: boolean;
  batch: boolean;
  ended: boolean;
}

/**
 * Tracks all loaded CJS/ESM module copies, including those loaded while
 * disabled, so each copy is patched or unpatched together.
 */
function createTrackedModuleFile<T extends object>(
  name: string,
  patch: (module: T) => void,
  unpatch: (module: T) => void,
  track?: (module: T) => void
): InstrumentationNodeModuleFile {
  const instances = new Set<T>();
  const file = new InstrumentationNodeModuleFile(
    name,
    SUPPORTED_VERSIONS,
    (module: T) => {
      instances.add(module);
      for (const instance of instances) {
        track?.(instance);
        patch(instance);
      }
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
      // Factory identity hooks stay active while disabled, without telemetry.
      // Otherwise adapters created during disable cannot be identified later.
      track?.(module);
    },
  });
  return file;
}

export class LangChainInstrumentation extends InstrumentationBase<LangChainInstrumentationConfig> {
  declare private _workflowDuration: Histogram | undefined;
  declare private _toolTelemetry: TelemetryHandler | undefined;
  declare private _toolTracerProvider: TracerProvider | undefined;
  declare private _toolMeterProvider: MeterProvider | undefined;
  declare private _toolExecutors: Set<WeakRef<ToolExecutor>> | undefined;
  declare private _callbackManager: typeof CallbackManager | undefined;
  declare private _getGraphConfig:
    | (typeof import('@langchain/langgraph'))['getConfig']
    | undefined;

  constructor(config: LangChainInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    const env =
      process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT?.trim();
    if (env) {
      this.setConfig({
        ...this.getConfig(),
        captureMessageContent: this._captureMode(env.toLowerCase()),
      });
    }
  }

  override setConfig(config: LangChainInstrumentationConfig = {}) {
    super.setConfig({
      ...config,
      captureMessageContent: this._captureMode(config.captureMessageContent),
    });
    this._toolTelemetry = undefined;
  }

  override setTracerProvider(provider: TracerProvider) {
    super.setTracerProvider(provider);
    this._toolTracerProvider = provider;
    this._toolTelemetry = undefined;
  }

  override setMeterProvider(provider: MeterProvider) {
    super.setMeterProvider(provider);
    this._toolMeterProvider = provider;
    this._toolTelemetry = undefined;
  }

  override disable() {
    super.disable();
    for (const reference of this._toolExecutors ?? []) {
      const target = reference.deref();
      if (target) this._unpatchMethod(target, '_call');
    }
    this._toolExecutors?.clear();
  }

  private _getToolTelemetry(): TelemetryHandler {
    return (this._toolTelemetry ??= new TelemetryHandler({
      instrumentationName: PACKAGE_NAME,
      instrumentationVersion: PACKAGE_VERSION,
      tracerProvider: this._toolTracerProvider,
      meterProvider: this._toolMeterProvider,
      diag: this._diag,
      contentCaptureMode: this.getConfig().captureMessageContent ?? 'none',
    }));
  }

  override _updateMetricInstruments() {
    try {
      this._workflowDuration = this.meter.createHistogram(
        METRIC_GEN_AI_INVOKE_WORKFLOW_DURATION,
        {
          description: 'Records duration of GenAI workflow.',
          unit: 's',
          advice: {
            explicitBucketBoundaries: [
              1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600, 7200,
            ],
          },
        }
      );
    } catch {
      this._workflowDuration = undefined;
      this._diag.warn('LangChain: could not create workflow duration metric');
    }
  }

  /**
   * Validates the content-capture mode, defaulting to no capture and warning
   * when an unsupported value is supplied.
   */
  private _captureMode(
    value: unknown
  ): NonNullable<LangChainInstrumentationConfig['captureMessageContent']> {
    if (value === undefined) return 'none';
    if (value === 'span_only' || value === 'none') return value;
    // The base constructor calls setConfig before its component logger exists.
    (this._diag ?? diag).warn(
      'LangChain: invalid captureMessageContent mode; using none'
    );
    return 'none';
  }

  protected init() {
    const files = ['cjs', 'js'].flatMap(extension => [
      createTrackedModuleFile(
        `${MODULE_NAME}/dist/runnables/base.${extension}`,
        (module: typeof Runnables) => this._patchRunnables(module),
        (module: typeof Runnables) => this._unpatchRunnables(module),
        (module: typeof Runnables) => this._trackRunnableFactories(module)
      ),
      createTrackedModuleFile(
        `${MODULE_NAME}/dist/runnables/history.${extension}`,
        () => {},
        () => {},
        (module: Pick<typeof Runnables, 'RunnableWithMessageHistory'>) =>
          this._trackWorkflowOwner(module.RunnableWithMessageHistory)
      ),
      createTrackedModuleFile(
        `${MODULE_NAME}/dist/runnables/passthrough.${extension}`,
        () => {},
        () => {},
        (module: typeof Runnables) => {
          if (!isTrackingFactory(module.RunnablePassthrough.assign))
            this._wrapTracking(
              module.RunnablePassthrough,
              'assign',
              trackFactory(
                result => markWorkflow(ownValue(result, 'mapper')),
                this._diag
              )
            );
        }
      ),
      createTrackedModuleFile(
        `${MODULE_NAME}/dist/language_models/chat_models.${extension}`,
        () => {},
        () => {},
        (module: { BaseChatModel: typeof BaseChatModel }) => {
          if (
            !isTrackingFactory(
              module.BaseChatModel.prototype.withStructuredOutput
            )
          )
            this._wrapTracking(
              module.BaseChatModel.prototype,
              'withStructuredOutput',
              trackFactory(
                (result, _receiver, args) =>
                  markStructuredOutput(result, ownValue(args[1], 'includeRaw')),
                this._diag
              )
            );
        }
      ),
      createTrackedModuleFile(
        `${MODULE_NAME}/dist/language_models/structured_output.${extension}`,
        () => {},
        () => {},
        (module: {
          assembleStructuredOutputPipeline: (
            llm: unknown,
            parser: unknown,
            includeRaw?: boolean,
            runName?: string
          ) => unknown;
        }) => {
          if (!isTrackingFactory(module.assembleStructuredOutputPipeline))
            this._wrapTracking(
              module,
              'assembleStructuredOutputPipeline',
              trackFactory(
                (result, _receiver, args) =>
                  markStructuredOutput(result, args[2]),
                this._diag
              )
            );
        }
      ),
      createTrackedModuleFile(
        `${MODULE_NAME}/dist/tools/index.${extension}`,
        (module: { StructuredTool: typeof StructuredTool }) =>
          this._patchToolCalls(module.StructuredTool),
        (module: { StructuredTool: typeof StructuredTool }) =>
          this._unpatchMethod(module.StructuredTool.prototype, 'call')
      ),
      createTrackedModuleFile(
        `${MODULE_NAME}/dist/callbacks/manager.${extension}`,
        (module: { CallbackManager: typeof CallbackManager }) =>
          this._patchToolCallbacks(module.CallbackManager),
        (module: { CallbackManager: typeof CallbackManager }) =>
          this._unpatchMethod(
            module.CallbackManager.prototype,
            'handleToolStart'
          ),
        (module: { CallbackManager: typeof CallbackManager }) => {
          this._callbackManager = module.CallbackManager;
        }
      ),
    ]);
    return [
      new InstrumentationNodeModuleDefinition(
        MODULE_NAME,
        SUPPORTED_VERSIONS,
        undefined,
        undefined,
        files
      ),
      new InstrumentationNodeModuleDefinition(
        'langchain',
        SUPPORTED_VERSIONS,
        undefined,
        undefined,
        ['cjs', 'js'].flatMap(extension => [
          createTrackedModuleFile(
            `langchain/dist/agents/index.${extension}`,
            () => {},
            () => {},
            (module: { createAgent: (...args: never[]) => unknown }) => {
              if (!isTrackingFactory(module.createAgent))
                this._wrapTracking(
                  module,
                  'createAgent',
                  trackFactory(markAgentGraph, this._diag)
                );
            }
          ),
          createTrackedModuleFile(
            `langchain/dist/agents/ReactAgent.${extension}`,
            () => {},
            () => {},
            (module: {
              ReactAgent: {
                prototype: { withConfig: (...args: never[]) => unknown };
              };
            }) => {
              if (
                typeof module.ReactAgent.prototype.withConfig === 'function' &&
                !isTrackingFactory(module.ReactAgent.prototype.withConfig)
              )
                this._wrapTracking(
                  module.ReactAgent.prototype,
                  'withConfig',
                  trackFactory(markAgentGraph, this._diag)
                );
            }
          ),
          createTrackedModuleFile(
            `langchain/dist/agents/withAgentName.${extension}`,
            () => {},
            () => {},
            (module: {
              withAgentName: (model: unknown, mode: unknown) => unknown;
            }) => {
              if (!isTrackingFactory(module.withAgentName))
                this._wrapTracking(
                  module,
                  'withAgentName',
                  trackFactory(result => markWorkflow(result), this._diag)
                );
            }
          ),
          createTrackedModuleFile(
            `langchain/dist/agents/utils.${extension}`,
            () => {},
            () => {},
            (module: { getPromptRunnable: (prompt: unknown) => unknown }) => {
              if (
                typeof module.getPromptRunnable === 'function' &&
                !isTrackingFactory(module.getPromptRunnable)
              ) {
                this._wrapTracking(
                  module,
                  'getPromptRunnable',
                  trackFactory(result => markAgentPrompt(result), this._diag)
                );
              }
            }
          ),
        ])
      ),
      new InstrumentationNodeModuleDefinition(
        '@langchain/langgraph',
        SUPPORTED_VERSIONS,
        undefined,
        undefined,
        ['cjs', 'js'].flatMap(extension => [
          createTrackedModuleFile(
            `@langchain/langgraph/dist/pregel/utils/config.${extension}`,
            () => {},
            () => {},
            (
              module: Pick<typeof import('@langchain/langgraph'), 'getConfig'>
            ) => {
              this._getGraphConfig = module.getConfig;
            }
          ),
          createTrackedModuleFile(
            `@langchain/langgraph/dist/pregel/index.${extension}`,
            (module: typeof PregelModule) => this._patchGraphs(module),
            (module: typeof PregelModule) => {
              this._unpatchMethod(module.Pregel.prototype, 'stream');
            },
            (module: typeof PregelModule) => {
              if (!isTrackingFactory(module.Pregel.prototype.withConfig))
                this._wrapTracking(
                  module.Pregel.prototype,
                  'withConfig',
                  trackFactory((result, receiver) => {
                    if (isRecord(receiver) && isInternalWorkflow(receiver))
                      markWorkflow(result);
                  }, this._diag)
                );
            }
          ),
          createTrackedModuleFile(
            `@langchain/langgraph/dist/utils.${extension}`,
            (module: {
              RunnableCallable: {
                prototype: Pick<Runnables.Runnable, 'invoke'>;
              };
            }) => {
              this._patchMethod(
                module.RunnableCallable.prototype,
                'invoke',
                (owners, restore) => original =>
                  new Proxy(original, {
                    apply: (
                      target,
                      receiver: Runnables.Runnable,
                      args: Parameters<typeof original>
                    ) => {
                      const owner = Array.from(owners)
                        .reverse()
                        .find(instance => instance.isEnabled());
                      if (!owner) restore();
                      const invoke = () =>
                        Reflect.apply(target, receiver, args);
                      return owner
                        ? owner._withGraphContext(args[1], invoke)
                        : invoke();
                    },
                  })
              );
            },
            (module: {
              RunnableCallable: {
                prototype: Pick<Runnables.Runnable, 'invoke'>;
              };
            }) =>
              this._unpatchMethod(module.RunnableCallable.prototype, 'invoke')
          ),
          createTrackedModuleFile(
            `@langchain/langgraph/dist/prebuilt/react_agent_executor.${extension}`,
            () => {},
            () => {},
            (module: { createReactAgent: (...args: never[]) => unknown }) => {
              if (!isTrackingFactory(module.createReactAgent))
                this._wrapTracking(
                  module,
                  'createReactAgent',
                  trackFactory(markWorkflow, this._diag)
                );
            }
          ),
        ])
      ),
    ];
  }

  private _withGraphContext<R>(options: unknown, invoke: () => R): R {
    const parent = context.active();
    if (isTracingSuppressed(parent)) return invoke();
    let graph: Context | undefined;
    try {
      graph = getGraphContext(ownValue(options, 'callbacks'));
    } catch {
      this._diag.warn('LangChain: could not read graph execution context');
    }
    return graph ? context.with(graph, invoke) : invoke();
  }

  private _patchGraphs(module: typeof PregelModule) {
    // streamEvents merges configured callbacks before delegating to stream.
    // Register only after that merge, without adding managers to handler arrays.
    this._patchMethod(
      module.Pregel.prototype,
      'stream',
      (owners, restore) => original =>
        new Proxy(original, {
          apply(
            target,
            receiver: Runnables.Runnable,
            args: [unknown, Runnables.RunnableConfig?]
          ) {
            const owner = Array.from(owners)
              .reverse()
              .find(instance => instance.isEnabled());
            if (!owner) restore();
            const active = context.active();
            if (
              !owner ||
              isTracingSuppressed(active) ||
              isInternalWorkflow(receiver)
            )
              return Reflect.apply(target, receiver, args);
            const manager = owner._callbackManager;
            if (!manager) {
              owner._diag.warn(
                'LangChain: graph callback manager is unavailable'
              );
              return Reflect.apply(target, receiver, args);
            }
            let state: WorkflowState | undefined;
            try {
              const defaults = ownValue(receiver, 'config');
              const inherited = owner._getGraphConfig?.();
              const configValue = (key: string): unknown => {
                for (const config of [args[1], defaults, inherited]) {
                  const descriptor = isRecord(config)
                    ? Object.getOwnPropertyDescriptor(config, key)
                    : undefined;
                  if (descriptor && !('value' in descriptor))
                    throw new TypeError(
                      'Accessor-backed graph callback configuration'
                    );
                  if (descriptor?.value !== undefined) return descriptor.value;
                }
                return undefined;
              };
              const callbacks = configValue('callbacks');
              function isManager(value: unknown): value is CallbackManager {
                return (
                  isRecord(value) &&
                  typeof value.copy === 'function' &&
                  Array.isArray(value.handlers)
                );
              }
              if (
                callbacks !== undefined &&
                !Array.isArray(callbacks) &&
                !isManager(callbacks)
              )
                throw new TypeError('Unsupported graph callback configuration');
              const runName = configValue('runName');
              const configured = manager._configureSync(callbacks ?? []);
              if (configured) {
                const graphCallbacks = addGraphCallbacks(
                  configured,
                  manager,
                  (_input, metadata, parent) => {
                    if (
                      !owner.isEnabled() ||
                      isTracingSuppressed(context.active())
                    )
                      return undefined;
                    try {
                      state = owner._startWorkflow(
                        receiver,
                        undefined,
                        { runName, metadata },
                        false,
                        trace.getSpan(active) ? active : (parent ?? active)
                      );
                      return state.context;
                    } catch {
                      owner._diag.warn(
                        'LangChain: could not start graph telemetry'
                      );
                      return undefined;
                    }
                  },
                  (input, output, failure) => {
                    if (!state) return;
                    try {
                      if (state.capture) {
                        const content = messages(input, owner._diag);
                        if (content !== undefined)
                          state.span.setAttribute(
                            ATTR_GEN_AI_INPUT_MESSAGES,
                            content
                          );
                      }
                    } catch {
                      owner._diag.warn(
                        'LangChain: could not extract graph input telemetry'
                      );
                    } finally {
                      owner._end(state, output, failure);
                    }
                  }
                );
                args[1] = { ...args[1], callbacks: graphCallbacks };
              }
            } catch {
              owner._diag.warn('LangChain: could not register graph callbacks');
            }
            return Reflect.apply(target, receiver, args);
          },
        })
    );
  }

  private _patchToolCalls(tool: typeof StructuredTool) {
    this._patchMethod(
      tool.prototype,
      'call',
      (owners, restore) => original =>
        function (this: StructuredTool, ...args: Parameters<typeof original>) {
          const owner = Array.from(owners)
            .reverse()
            .find(instance => instance.isEnabled());
          if (!owner) restore();
          try {
            owner?._patchToolExecution(this);
          } catch {
            owner?._diag.warn('LangChain: could not patch tool execution');
          }
          try {
            if (owner && !isTracingSuppressed(context.active())) {
              const config = args[1];
              // Match the SDK's config/callback overload without modifying it.
              if (
                !config ||
                (!Array.isArray(config) &&
                  !('name' in config) &&
                  config.callbacks === undefined)
              ) {
                args[1] = { ...config, callbacks: [] };
              }
            }
          } catch {
            owner?._diag.warn('LangChain: could not configure tool callbacks');
          }
          return original.apply(this, args);
        }
    );
  }

  private _patchToolExecution(target: object) {
    // _call is implemented by concrete subclasses, including user-defined tools.
    while (!Object.prototype.hasOwnProperty.call(target, '_call')) {
      const prototype: object | null = Object.getPrototypeOf(target);
      if (!prototype) {
        this._diag.warn('LangChain: could not find tool execution method');
        return;
      }
      target = prototype;
    }
    if (!isToolExecutor(target)) {
      this._diag.warn('LangChain: tool execution method is not callable');
      return;
    }
    if (workflowPatches.get(target)?.get('_call')?.owners.has(this)) return;
    this._patchMethod(
      target,
      '_call',
      (owners, restore) => original =>
        function (this: ToolExecutor, ...args: Parameters<typeof original>) {
          const owner = Array.from(owners)
            .reverse()
            .find(instance => instance.isEnabled());
          if (!owner) restore();
          let toolContext: Context | undefined;
          try {
            if (owner && !isTracingSuppressed(context.active()))
              toolContext = getToolContext(args[1]);
          } catch {
            owner?._diag.warn(
              'LangChain: could not read tool execution context'
            );
          }
          return toolContext
            ? context.with(toolContext, original, this, ...args)
            : original.apply(this, args);
        }
    );
    const targets = (this._toolExecutors ??= new Set());
    for (const reference of targets) {
      if (!reference.deref()) targets.delete(reference);
    }
    targets.add(new WeakRef(target));
  }

  private _patchToolCallbacks(manager: typeof CallbackManager) {
    this._patchMethod(
      manager.prototype,
      'handleToolStart',
      (owners, restore) => {
        const currentOwner = () =>
          Array.from(owners)
            .reverse()
            .find(instance => instance.isEnabled());
        return original =>
          function (
            this: CallbackManager,
            ...args: Parameters<typeof original>
          ) {
            const owner = currentOwner();
            if (!owner) {
              restore();
              return original.apply(this, args);
            }
            let invocation = this;
            try {
              // The SDK run manager retains this invocation's handler, even
              // when the caller reuses its callback manager or run ID.
              invocation = addToolCallbacks(
                this.copy(),
                manager,
                () => currentOwner()?._getToolTelemetry(),
                () => currentOwner()?._diag ?? diag,
                () =>
                  trace.getSpan(context.active())
                    ? undefined
                    : getGraphContext(this)
              );
            } catch {
              owner._diag.warn('LangChain: could not register tool callbacks');
            }
            return original.apply(invocation, args);
          };
      }
    );
  }

  private _trackRunnableFactories(module: typeof Runnables) {
    if (!module.Runnable) return;
    if (!isTrackingFactory(module.Runnable.prototype.pipe))
      this._wrapTracking(
        module.Runnable.prototype,
        'pipe',
        trackFactory(markAgentPromptComposition, this._diag)
      );
    this._trackWorkflowOwner(module.RunnableToolLike);
    if (!isTrackingFactory(module.Runnable.prototype.asTool))
      this._wrapTracking(
        module.Runnable.prototype,
        'asTool',
        trackFactory(
          result => markWorkflow(ownValue(result, 'bound')),
          this._diag
        )
      );
    if (!isTrackingFactory(module.Runnable.prototype.assign))
      this._wrapTracking(
        module.Runnable.prototype,
        'assign',
        trackFactory(
          result => markWorkflow(ownValue(ownValue(result, 'last'), 'mapper')),
          this._diag
        )
      );
    if (!isTrackingFactory(module.RunnableBinding.prototype.withConfig))
      this._wrapTracking(
        module.RunnableBinding.prototype,
        'withConfig',
        trackFactory((result, receiver) => {
          if (receiver instanceof module.RunnableToolLike) {
            // ToolLike.withConfig constructs a new adapter around the old one.
            markWorkflow(ownValue(receiver, 'bound'));
            markWorkflow(ownValue(result, 'bound'));
          }
        }, this._diag)
      );
  }

  private _trackWorkflowOwner(
    owner: (abstract new (...args: never[]) => object) & {
      prototype: Pick<Runnables.Runnable<unknown, unknown>, 'invoke' | 'batch'>;
    }
  ) {
    for (const method of ['invoke', 'batch'] as const) {
      if (!isTrackingFactory(owner.prototype[method])) {
        this._wrapTracking(
          owner.prototype,
          method,
          trackOwnedWorkflow(owner, this._diag)
        );
      }
    }
  }

  private _wrapTracking<T extends object, K extends keyof T>(
    target: T,
    method: K,
    factory: (original: T[K]) => T[K]
  ) {
    // Tracking stays active while disabled, so never unwrap another owner.
    // defineProperty also supports import-in-the-middle module proxies.
    Object.defineProperty(target, method, {
      configurable: true,
      writable: true,
      value: factory(target[method]),
    });
  }

  /**
   * Wraps sequence and map invocations, plus the sequence-specific batch path.
   */
  private _patchRunnables(module: typeof Runnables) {
    for (const cls of [module.RunnableSequence, module.RunnableMap]) {
      this._patchMethod(cls.prototype, 'invoke', (owners, restore) =>
        this._createInvokeWrapper(owners, restore)
      );
    }
    // Sequence has an optimized batch; Map's inherited batch invokes
    // each item separately and is already covered by its invoke patch.
    this._patchMethod(
      module.RunnableSequence.prototype,
      'batch',
      (owners, restore) => this._createBatchWrapper(owners, restore)
    );
  }

  private _patchMethod<T extends object, K extends keyof T>(
    target: T,
    method: K,
    factory: (
      owners: Set<LangChainInstrumentation>,
      restore: () => void
    ) => (original: T[K]) => T[K]
  ) {
    const patches =
      workflowPatches.get(target) ?? new Map<PropertyKey, WorkflowPatch>();
    workflowPatches.set(target, patches);
    const existing = patches.get(method);
    if (existing) {
      existing.owners.add(this);
      return;
    }
    const owners = new Set([this]);
    const original = target[method];
    const patch: WorkflowPatch = {
      owners,
      restore: () => {
        if (owners.size !== 0 || target[method] !== wrapped) return;
        target[method] = original;
        if (patches.get(method) === patch) patches.delete(method);
      },
    };
    const wrapped = factory(owners, patch.restore)(original);
    // The base _wrap removes existing wrappers, including those we do not own.
    target[method] = wrapped;
    patches.set(method, patch);
  }

  /**
   * Restores the runnable methods wrapped by this instrumentation.
   */
  private _unpatchRunnables(module: typeof Runnables) {
    for (const cls of [module.RunnableSequence, module.RunnableMap]) {
      this._unpatchMethod(cls.prototype, 'invoke');
    }
    this._unpatchMethod(module.RunnableSequence.prototype, 'batch');
  }

  private _unpatchMethod(
    target: object,
    method: 'invoke' | 'batch' | 'call' | '_call' | 'handleToolStart' | 'stream'
  ) {
    const patches = workflowPatches.get(target);
    if (!patches) return;
    const patch = patches.get(method);
    if (!patch?.owners.delete(this)) return;
    patch.restore();
  }

  private _createInvokeWrapper(
    owners: Set<LangChainInstrumentation>,
    restore: () => void
  ) {
    return <T extends Runnables.Runnable, R>(
      original: (this: T, ...args: Parameters<T['invoke']>) => R
    ) =>
      function (this: T, ...args: Parameters<T['invoke']>): R {
        const owner = Array.from(owners)
          .reverse()
          .find(instance => instance.isEnabled());
        const invoke = () => original.apply(this, args);
        // An outer wrapper may have exposed us again after the last disable.
        if (!owner) restore();
        return owner
          ? owner._traceWorkflow(this, args[0], args[1], false, invoke)
          : invoke();
      };
  }

  private _createBatchWrapper(
    owners: Set<LangChainInstrumentation>,
    restore: () => void
  ) {
    return <T extends Runnables.RunnableSequence, R>(
      original: (this: T, ...args: Parameters<T['batch']>) => R
    ) =>
      function (this: T, ...args: Parameters<T['batch']>): R {
        const owner = Array.from(owners)
          .reverse()
          .find(instance => instance.isEnabled());
        const invoke = () => original.apply(this, args);
        if (!owner) restore();
        return owner
          ? owner._traceWorkflow(this, args[0], args[1], true, invoke)
          : invoke();
      };
  }

  /**
   * Runs a workflow in its span context and observes completion while preserving
   * the original return value or thrown error.
   */
  private _traceWorkflow<R>(
    target: Runnables.Runnable,
    input: unknown,
    options: Parameters<Runnables.RunnableSequence['batch']>[1],
    batch: boolean,
    invoke: () => R
  ): R {
    const parent = context.active();
    if (
      !this.isEnabled() ||
      isTracingSuppressed(parent) ||
      isInternalWorkflow(target)
    )
      return invoke();
    let state: WorkflowState | undefined;
    let graphContext: Context | undefined;
    try {
      // LangGraph sets omitSequenceTags on internal node/channel-writer
      // sequences (e.g. PregelNode.getNode()) to omit seq:step:* callback tags.
      // Skip these internal adapters rather than reporting them as workflows.
      if (!('omitSequenceTags' in target && target.omitSequenceTags === true)) {
        state = this._startWorkflow(target, input, options, batch, parent);
      } else {
        graphContext = getGraphContext(ownValue(options, 'callbacks'));
      }
    } catch {
      this._diag.warn('LangChain: could not start operation telemetry');
    }
    if (!state)
      return graphContext ? context.with(graphContext, invoke) : invoke();
    const active = state;
    let result: R;
    try {
      result = context.with(active.context, invoke);
    } catch (error) {
      this._end(active, undefined, { error });
      throw error;
    }
    try {
      if (result instanceof Promise) {
        void result.then(
          value => this._end(active, value),
          error => this._end(active, undefined, { error })
        );
      } else {
        this._end(active, result);
      }
    } catch {
      this._diag.warn('LangChain: could not observe operation result');
      this._end(active);
    }
    return result;
  }

  private _startWorkflow(
    target: object,
    input: unknown,
    options: unknown,
    batch: boolean,
    parent: Context
  ): WorkflowState {
    const capture = this.getConfig().captureMessageContent === 'span_only';
    const attributes = this._generateWorkflowAttributes(
      target,
      input,
      options,
      capture
    );
    const operation = GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW;
    const name = attributes[ATTR_GEN_AI_WORKFLOW_NAME];
    const metricAttributes: Attributes = {};
    if (typeof name === 'string')
      metricAttributes[ATTR_GEN_AI_WORKFLOW_NAME] = name;
    const startTime = hrTime();
    const span = this.tracer.startSpan(
      name ? `${operation} ${name}` : operation,
      { kind: SpanKind.INTERNAL, attributes, startTime },
      parent
    );
    return {
      span,
      context: trace.setSpan(parent, span),
      startTime,
      durationHistogram: this._workflowDuration,
      metricAttributes,
      capture,
      batch,
      ended: false,
    };
  }

  /**
   * Builds workflow and conversation attributes from the runnable and options,
   * adding input messages only when content capture is enabled.
   */
  private _generateWorkflowAttributes(
    target: object,
    input: unknown,
    options: unknown,
    capture: boolean
  ): Attributes {
    const configurable = this._configValue(options, 'configurable');
    const metadata = this._configValue(options, 'metadata');
    const conversation = [
      this._configValue(configurable, 'thread_id'),
      this._configValue(configurable, 'session_id'),
      this._configValue(configurable, 'conversation_id'),
      this._configValue(metadata, 'session_id'),
      this._configValue(metadata, 'thread_id'),
      this._configValue(metadata, 'conversation_id'),
    ].find(
      (value): value is string => typeof value === 'string' && value.length > 0
    );
    let name = this._configValue(options, 'runName');
    if (typeof name !== 'string' || name.trim().length === 0)
      name = this._configValue(target, 'name');
    const attributes: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
    };
    if (typeof name === 'string' && name.trim().length > 0)
      attributes[ATTR_GEN_AI_WORKFLOW_NAME] = name;
    if (conversation !== undefined)
      attributes[ATTR_GEN_AI_CONVERSATION_ID] = conversation;
    if (capture) {
      const content = messages(input, this._diag);
      if (content !== undefined)
        attributes[ATTR_GEN_AI_INPUT_MESSAGES] = content;
    }
    return attributes;
  }

  /**
   * Reads an own configuration value without invoking getters, warning and
   * omitting accessor-backed properties to avoid affecting SDK behavior.
   */
  private _configValue(value: unknown, key: string): unknown {
    if (!isRecord(value)) return undefined;
    // The SDK owns reading its options. Observing accessors here can change
    // both their side effects and the effective values subsequently seen by it.
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && !('value' in descriptor)) {
      this._diag.warn(
        'LangChain: omitting accessor-backed configuration attribute'
      );
      return undefined;
    }
    return descriptor?.value;
  }

  /**
   * Ends a workflow span once, recording failure details or opt-in output
   * content and logging telemetry errors without disrupting the application.
   */
  private _end(
    state: WorkflowState,
    output?: unknown,
    failure?: { error: unknown }
  ) {
    if (state.ended) return;
    // Freeze the end before content extraction or metric recording adds overhead.
    const endTime = hrTime();
    state.ended = true;
    try {
      if (failure) {
        let name = '_OTHER';
        try {
          const errorName =
            failure.error instanceof Error ? failure.error.name : undefined;
          if (typeof errorName === 'string' && errorName) name = errorName;
        } catch {
          this._diag.warn('LangChain: could not classify operation failure');
        }
        state.metricAttributes[ATTR_ERROR_TYPE] = name;
        state.span.setStatus({ code: SpanStatusCode.ERROR });
        state.span.setAttribute(ATTR_ERROR_TYPE, name);
      } else if (state.capture) {
        const content = state.batch
          ? batchOutputMessages(output, this._diag)
          : messages(output, this._diag, 'assistant');
        if (content !== undefined)
          state.span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, content);
      }
    } catch {
      this._diag.warn('LangChain: could not extract operation telemetry');
    } finally {
      try {
        state.durationHistogram?.record(
          hrTimeToSeconds(hrTimeDuration(state.startTime, endTime)),
          state.metricAttributes,
          state.context
        );
      } catch {
        this._diag.warn('LangChain: could not record workflow duration');
      }
      try {
        state.span.end(endTime);
      } catch {
        this._diag.warn('LangChain: could not end operation telemetry');
      }
    }
  }
}
