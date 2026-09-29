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
  type Span,
} from '@opentelemetry/api';
import {
  hrTime,
  hrTimeDuration,
  hrTimeToSeconds,
  isTracingSuppressed,
} from '@opentelemetry/core';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
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
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { LangChainInstrumentationConfig } from './types';
import { batchOutputMessages, isRecord, messages } from './content';

const MODULE_NAME = '@langchain/core';
const SUPPORTED_VERSIONS = ['>=1.0.0 <2'];

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
  unpatch: (module: T) => void
): InstrumentationNodeModuleFile {
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
  declare private _workflowDuration: Histogram | undefined;

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
    const files = ['cjs', 'js'].map(extension =>
      createTrackedModuleFile(
        `${MODULE_NAME}/dist/runnables/base.${extension}`,
        (module: typeof Runnables) => this._patchRunnables(module),
        (module: typeof Runnables) => this._unpatchRunnables(module)
      )
    );
    return [
      new InstrumentationNodeModuleDefinition(
        MODULE_NAME,
        SUPPORTED_VERSIONS,
        undefined,
        undefined,
        files
      ),
    ];
  }

  /**
   * Wraps sequence and map invocations, plus the sequence-specific batch path.
   */
  private _patchRunnables(module: typeof Runnables) {
    for (const cls of [module.RunnableSequence, module.RunnableMap]) {
      if (isWrapped(cls.prototype.invoke)) {
        this._unwrap(cls.prototype, 'invoke');
      }
      this._wrap(cls.prototype, 'invoke', this._createInvokeWrapper());
    }
    // Sequence has an optimized batch; Map's inherited batch invokes
    // each item separately and is already covered by its invoke patch.
    if (isWrapped(module.RunnableSequence.prototype.batch)) {
      this._unwrap(module.RunnableSequence.prototype, 'batch');
    }
    this._wrap(
      module.RunnableSequence.prototype,
      'batch',
      this._createBatchWrapper()
    );
  }

  /**
   * Restores the runnable methods wrapped by this instrumentation.
   */
  private _unpatchRunnables(module: typeof Runnables) {
    for (const cls of [module.RunnableSequence, module.RunnableMap]) {
      this._unwrap(cls.prototype, 'invoke');
    }
    this._unwrap(module.RunnableSequence.prototype, 'batch');
  }

  private _createInvokeWrapper() {
    const self = this;
    return <T extends Runnables.Runnable, R>(
      original: (this: T, ...args: Parameters<T['invoke']>) => R
    ) =>
      function (this: T, ...args: Parameters<T['invoke']>): R {
        return self._traceWorkflow(this, args[0], args[1], false, () =>
          original.apply(this, args)
        );
      };
  }

  private _createBatchWrapper() {
    const self = this;
    return <T extends Runnables.RunnableSequence, R>(
      original: (this: T, ...args: Parameters<T['batch']>) => R
    ) =>
      function (this: T, ...args: Parameters<T['batch']>): R {
        return self._traceWorkflow(this, args[0], args[1], true, () =>
          original.apply(this, args)
        );
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
    if (!this.isEnabled() || isTracingSuppressed(parent)) return invoke();
    let state: WorkflowState | undefined;
    try {
      // LangGraph sets omitSequenceTags on internal node/channel-writer
      // sequences (e.g. PregelNode.getNode()) to omit seq:step:* callback tags.
      // Skip these internal adapters rather than reporting them as workflows.
      if (!('omitSequenceTags' in target && target.omitSequenceTags === true)) {
        const tracer = this.tracer;
        const durationHistogram = this._workflowDuration;
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
        const span = tracer.startSpan(
          name ? `${operation} ${name}` : operation,
          { kind: SpanKind.INTERNAL, attributes, startTime },
          parent
        );
        state = {
          span,
          context: trace.setSpan(parent, span),
          startTime,
          durationHistogram,
          metricAttributes,
          capture,
          batch,
          ended: false,
        };
      }
    } catch {
      this._diag.warn('LangChain: could not start operation telemetry');
    }
    if (!state) return invoke();
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

  /**
   * Builds workflow and conversation attributes from the runnable and options,
   * adding input messages only when content capture is enabled.
   */
  private _generateWorkflowAttributes(
    target: Runnables.Runnable,
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
