/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import type { OpenAIAgentsModule } from './internal-types';
import { OpenAIAgentsTracingProcessor } from './processor';
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
          return moduleExports;
        },
        _moduleExports => {
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
      typeof candidate.setTraceProcessors === 'function'
    );
  }
}
