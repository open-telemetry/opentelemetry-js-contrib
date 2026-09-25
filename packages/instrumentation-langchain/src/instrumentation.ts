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
  type Span,
} from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
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
  capture: boolean;
  batch: boolean;
  ended: boolean;
}

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
        let state: WorkflowState | undefined;
        try {
          // LangGraph's internal node/channel sequences are not user workflows.
          if (!('omitSequenceTags' in this && this.omitSequenceTags === true)) {
            const tracer = self.tracer;
            const capture =
              self.getConfig().captureMessageContent === 'span_only';
            const attributes = self._attributes(
              this,
              args[0],
              args[1],
              capture
            );
            const operation = GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW;
            const name = attributes[ATTR_GEN_AI_WORKFLOW_NAME];
            const span = tracer.startSpan(
              name ? `${operation} ${name}` : operation,
              { kind: SpanKind.INTERNAL, attributes },
              parent
            );
            state = {
              span,
              context: trace.setSpan(parent, span),
              capture,
              batch,
              ended: false,
            };
          }
        } catch {
          self._diag.warn('LangChain: could not start operation telemetry');
        }
        if (!state) return original.apply(this, args);
        const active = state;
        let result: R;
        try {
          result = context.with(active.context, () =>
            original.apply(this, args)
          );
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
    state: WorkflowState,
    output?: unknown,
    failure?: { error: unknown }
  ) {
    if (state.ended) return;
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
        state.span.end();
      } catch {
        this._diag.warn('LangChain: could not end operation telemetry');
      }
    }
  }
}
