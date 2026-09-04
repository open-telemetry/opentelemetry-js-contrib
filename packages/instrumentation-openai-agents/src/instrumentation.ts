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

  constructor(config: OpenAIAgentsInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);

    const envCaptureContent = getEnvBool(
      'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT',
      this._diag
    );
    if (envCaptureContent !== undefined) {
      const currentConfig = this.getConfig();
      currentConfig.captureMessageContent = envCaptureContent;
    }
  }

  override setConfig(config: OpenAIAgentsInstrumentationConfig = {}): void {
    const normalizedConfig = {
      ...config,
      captureMessageContent: !!config.captureMessageContent,
      disableOpenAITraceExport: !!config.disableOpenAITraceExport,
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
        moduleExports => {
          const agents = this._normalizeModule(moduleExports);
          this._processor?.setEnabled(false);

          if (agents && this._registrationMode === 'replace') {
            if (agents.setDefaultOpenAITracingExporter) {
              agents.setDefaultOpenAITracingExporter();
            } else {
              this._diag.warn(
                'Could not restore the OpenAI Agents default trace exporter'
              );
            }
            this._registered = false;
            this._registeredModule = undefined;
            this._registrationMode = undefined;
          }
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

    if (this._registered && this._registrationMode === desiredMode) {
      return;
    }

    if (desiredMode === 'replace') {
      agents.setTraceProcessors([processor]);
    } else {
      if (this._registrationMode === 'replace') {
        agents.setDefaultOpenAITracingExporter?.();
      }
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
