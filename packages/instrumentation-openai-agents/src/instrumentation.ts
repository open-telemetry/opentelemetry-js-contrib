/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { context } from '@opentelemetry/api';
import type { OpenAIAgentsModule, OpenAIAgentsTrace } from './internal-types';
import {
  OPENAI_AGENTS_RUN_CONTEXT_KEY,
  OpenAIAgentsTracingProcessor,
} from './processor';
import type { OpenAIAgentsInstrumentationConfig } from './types';
import { getEnvBool } from './utils';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

type RegistrationMode = 'add' | 'replace';

export class OpenAIAgentsInstrumentation extends InstrumentationBase<OpenAIAgentsInstrumentationConfig> {
  private _processor?: OpenAIAgentsTracingProcessor;
  private _module?: OpenAIAgentsModule;
  private _registeredModule?: OpenAIAgentsModule;
  private _registered = false;
  private _registrationMode?: RegistrationMode;
  private _captureMessageContentFromEnv?: boolean;

  constructor(config: OpenAIAgentsInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);

    this._captureMessageContentFromEnv = getEnvBool(
      'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT',
      this._diag
    );
    if (this._captureMessageContentFromEnv !== undefined) {
      this.setConfig(this.getConfig());
    }
  }

  override setConfig(config: OpenAIAgentsInstrumentationConfig = {}): void {
    let disableOpenAITraceExport = !!config.disableOpenAITraceExport;
    if (
      this._registered &&
      this._registrationMode &&
      disableOpenAITraceExport !== (this._registrationMode === 'replace')
    ) {
      this._diag.warn(
        'disableOpenAITraceExport cannot be changed after the OpenAI Agents trace processor is registered; keeping the existing registration mode'
      );
      disableOpenAITraceExport = this._registrationMode === 'replace';
    }
    const normalizedConfig = {
      ...config,
      captureMessageContent:
        this._captureMessageContentFromEnv ?? !!config.captureMessageContent,
      disableOpenAITraceExport,
    };
    super.setConfig(normalizedConfig);
    this._processor?.setConfig(normalizedConfig);
    if (this._module && this.isEnabled()) {
      this._registerProcessor(this._module);
    }
  }

  protected init(): InstrumentationNodeModuleDefinition[] {
    return [
      new InstrumentationNodeModuleDefinition(
        '@openai/agents',
        ['>=0.14.0 <1'],
        moduleExports => {
          const agents = this._normalizeModule(moduleExports);
          if (!agents) {
            this._diag.warn(
              'Could not find the OpenAI Agents tracing processor API'
            );
            return moduleExports;
          }

          this._module = agents;
          if (this._registeredModule !== agents) {
            this._registered = false;
            this._registrationMode = undefined;
          }
          this._getProcessor().setEnabled(true);
          this._registerProcessor(agents);
          this._patchRunner(agents);
          this._patchWithTrace(agents);
          this._patchGetOrCreateTrace(agents);
          return moduleExports;
        },
        moduleExports => {
          const agents = this._normalizeModule(moduleExports);
          if (agents && isWrapped(agents.Runner.prototype.run)) {
            this._unwrap(agents.Runner.prototype, 'run');
          }
          if (agents && isWrapped(agents.withTrace)) {
            this._unwrap(agents, 'withTrace');
          }
          if (agents && isWrapped(agents.getOrCreateTrace)) {
            this._unwrap(agents, 'getOrCreateTrace');
          }
          this._processor?.setEnabled(false);
          this._module = undefined;
        }
      ),
    ];
  }

  private _getProcessor(): OpenAIAgentsTracingProcessor {
    if (!this._processor) {
      this._processor = new OpenAIAgentsTracingProcessor(
        () => this.tracer,
        this.getConfig(),
        this._diag
      );
    }
    return this._processor;
  }

  private _registerProcessor(agents: OpenAIAgentsModule): void {
    const processor = this._getProcessor();
    processor.setConfig(this.getConfig());
    const desiredMode: RegistrationMode = this.getConfig()
      .disableOpenAITraceExport
      ? 'replace'
      : 'add';

    if (this._registered) {
      return;
    }

    if (desiredMode === 'replace') {
      agents.setTraceProcessors([processor]);
    } else {
      agents.addTraceProcessor(processor);
    }
    this._registered = true;
    this._registeredModule = agents;
    this._registrationMode = desiredMode;
  }

  private _patchRunner(agents: OpenAIAgentsModule): void {
    if (isWrapped(agents.Runner.prototype.run)) {
      this._unwrap(agents.Runner.prototype, 'run');
    }
    const processor = this._getProcessor();
    this._wrap(agents.Runner.prototype, 'run', original => {
      return function patchedRun(this: unknown, ...args: unknown[]) {
        // Trace processor callbacks remain the primary instrumentation path.
        // This token only supplies the missing failure boundary: the SDK can
        // skip onTraceEnd when Runner.run rejects, and task callbacks cannot
        // be used as a fallback because they are optional and may belong to a
        // caller-managed withTrace() scope.
        const runToken = {};
        const runContext = context
          .active()
          .setValue(OPENAI_AGENTS_RUN_CONTEXT_KEY, runToken);
        return context.with(runContext, async () => {
          try {
            const result = await original.apply(this, args);
            OpenAIAgentsInstrumentation._watchStreamFailure(
              result,
              runToken,
              processor
            );
            return result;
          } catch (error) {
            processor.onRunError(runToken, error);
            throw error;
          }
        });
      };
    });
  }

  private static _watchStreamFailure(
    result: unknown,
    runToken: object,
    processor: OpenAIAgentsTracingProcessor
  ): void {
    if (!result || typeof result !== 'object') {
      return;
    }
    const completed = (result as { completed?: unknown }).completed;
    if (
      !completed ||
      typeof completed !== 'object' ||
      typeof (completed as PromiseLike<unknown>).then !== 'function'
    ) {
      return;
    }
    void Promise.resolve(completed).catch(error => {
      processor.onRunStreamError(runToken, error);
    });
  }

  private _patchWithTrace(agents: OpenAIAgentsModule): void {
    if (isWrapped(agents.withTrace)) {
      this._unwrap(agents, 'withTrace');
    }
    const processor = this._getProcessor();
    this._wrap(agents, 'withTrace', original => {
      return function patchedWithTrace(this: unknown, ...args: unknown[]) {
        const callback = args[1];
        if (typeof callback !== 'function') {
          return original.apply(this, args as Parameters<typeof original>);
        }
        args[1] = async (trace: unknown) => {
          try {
            return await callback(trace);
          } catch (error) {
            processor.onTraceError(trace as OpenAIAgentsTrace, error);
            throw error;
          }
        };
        return original.apply(this, args as Parameters<typeof original>);
      };
    });
  }

  private _patchGetOrCreateTrace(agents: OpenAIAgentsModule): void {
    if (isWrapped(agents.getOrCreateTrace)) {
      this._unwrap(agents, 'getOrCreateTrace');
    }
    const processor = this._getProcessor();
    this._wrap(agents, 'getOrCreateTrace', original => {
      return function patchedGetOrCreateTrace(
        this: unknown,
        ...args: unknown[]
      ) {
        const callback = args[0];
        if (typeof callback !== 'function') {
          return original.apply(this, args as Parameters<typeof original>);
        }
        args[0] = async () => {
          try {
            return await callback();
          } catch (error) {
            const trace = agents.getCurrentTrace();
            if (trace) {
              processor.onTraceError(trace, error);
            }
            throw error;
          }
        };
        return original.apply(this, args as Parameters<typeof original>);
      };
    });
  }

  private _normalizeModule(
    moduleExports: unknown
  ): OpenAIAgentsModule | undefined {
    if (this._isOpenAIAgentsModule(moduleExports)) {
      return moduleExports;
    }
    if (
      moduleExports &&
      typeof moduleExports === 'object' &&
      'default' in moduleExports &&
      this._isOpenAIAgentsModule(moduleExports.default)
    ) {
      return moduleExports.default;
    }
    return undefined;
  }

  private _isOpenAIAgentsModule(value: unknown): value is OpenAIAgentsModule {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
      return false;
    }
    const candidate = value as Partial<OpenAIAgentsModule>;
    return (
      typeof candidate.addTraceProcessor === 'function' &&
      typeof candidate.setTraceProcessors === 'function' &&
      typeof candidate.withTrace === 'function' &&
      typeof candidate.getOrCreateTrace === 'function' &&
      typeof candidate.getCurrentTrace === 'function' &&
      typeof candidate.Runner === 'function' &&
      typeof candidate.Runner.prototype?.run === 'function'
    );
  }
}
