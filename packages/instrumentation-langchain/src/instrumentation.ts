/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { context, diag, type Attributes } from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import {
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_WORKFLOW_NAME,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
  TelemetryHandler,
} from '@opentelemetry/genai-util';
import type * as Runnables from '@langchain/core/runnables';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { LangChainInstrumentationConfig } from './types';
import { isRecord, messages } from './content';
import { LangChainWorkflowInvocation } from './workflow';

const MODULE_NAME = '@langchain/core';
const SUPPORTED_VERSIONS = ['>=1.0.0 <2'];

function createTrackedModuleFile<T extends object>(
  name: string,
  patch: (module: T) => void,
  unpatch: (module: T) => void
): InstrumentationNodeModuleFile {
  // Track both CJS/ESM copies, including copies loaded while disabled.
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
  declare private _handler?: TelemetryHandler;

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

  private _patchRunnables(module: typeof Runnables) {
    for (const cls of [module.RunnableSequence, module.RunnableMap]) {
      this._wrap(cls.prototype, 'invoke', this._wrapper());
    }
    // Sequence has an optimized batch; Map's inherited batch invokes
    // each item separately and is already covered by its invoke patch.
    this._wrap(module.RunnableSequence.prototype, 'batch', this._wrapper(true));
  }

  private _unpatchRunnables(module: typeof Runnables) {
    for (const cls of [module.RunnableSequence, module.RunnableMap]) {
      this._unwrap(cls.prototype, 'invoke');
    }
    this._unwrap(module.RunnableSequence.prototype, 'batch');
  }

  private _getHandler(): TelemetryHandler {
    const capture = this.getConfig().captureMessageContent ?? 'none';
    // Lazy snapshots avoid base-constructor override hazards and pick up
    // setTracerProvider, setMeterProvider and setConfig for future invocations.
    if (
      !this._handler ||
      this._handler.getTracer() !== this.tracer ||
      this._handler.getMeter() !== this.meter ||
      this._handler.getContentCaptureMode() !== capture
    ) {
      this._handler = new TelemetryHandler({
        instrumentationName: PACKAGE_NAME,
        instrumentationVersion: PACKAGE_VERSION,
        tracerProvider: { getTracer: () => this.tracer },
        meterProvider: { getMeter: () => this.meter },
        diag: this._diag,
        // Resolve the environment only at construction, not on later updates.
        contentCaptureMode: capture,
      });
    }
    return this._handler;
  }

  private _wrapper(batch = false) {
    const self = this;
    return <T extends Runnables.Runnable, A extends unknown[], R>(
      original: (this: T, ...args: A) => R
    ) =>
      function (this: T, ...args: A): R {
        const parent = context.active();
        if (!self.isEnabled() || isTracingSuppressed(parent)) {
          return original.apply(this, args);
        }
        let invocation: LangChainWorkflowInvocation | undefined;
        try {
          // LangGraph's internal node/channel sequences are not user workflows.
          if (!('omitSequenceTags' in this && this.omitSequenceTags === true)) {
            const handler = self._getHandler();
            invocation = new LangChainWorkflowInvocation(
              handler,
              self._attributes(
                this,
                args[0],
                args[1],
                handler.shouldCaptureContent()
              ),
              parent,
              batch
            );
          }
        } catch {
          self._diag.warn('LangChain: could not start operation telemetry');
        }
        if (!invocation) return original.apply(this, args);
        const active = invocation;
        let result: R;
        try {
          result = active.withContext(() => original.apply(this, args));
        } catch (error) {
          self._end(active, undefined, { error });
          throw error;
        }
        try {
          if (result instanceof Promise) {
            void result.then(
              value => self._end(active, value),
              error => self._end(active, undefined, { error })
            );
          } else {
            self._end(active, result);
          }
        } catch {
          self._diag.warn('LangChain: could not observe operation result');
          self._end(active);
        }
        return result;
      };
  }

  private _attributes(
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
    const runName = this._configValue(options, 'runName');
    const attributes: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
      [ATTR_GEN_AI_WORKFLOW_NAME]:
        typeof runName === 'string'
          ? runName
          : (target.name ?? target.getName()),
    };
    if (conversation !== undefined)
      attributes[ATTR_GEN_AI_CONVERSATION_ID] = conversation;
    if (capture) {
      const content = messages(input, this._diag);
      if (content !== undefined)
        attributes[ATTR_GEN_AI_INPUT_MESSAGES] = content;
    }
    return attributes;
  }

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

  private _end(
    invocation: LangChainWorkflowInvocation,
    output?: unknown,
    failure?: { error: unknown }
  ) {
    if (invocation.isEnded()) return;
    try {
      if (failure) invocation.fail(failure.error);
      else invocation.complete(output);
    } catch {
      // Span processors may throw from BaseInvocation's final span.end().
      this._diag.warn('LangChain: could not end operation telemetry');
    }
  }
}
