/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';

import { wrapQuery, type QueryFunction } from './query-wrapper';
import type { ClaudeAgentSDKInstrumentationConfig } from './types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

interface ClaudeAgentSDKModule {
  query?: QueryFunction;
  default?: ClaudeAgentSDKModule;
}

interface PatchState {
  source: ClaudeAgentSDKModule;
  target: ClaudeAgentSDKModule;
  originalQuery: QueryFunction;
}

let patchStates = new WeakMap<object, PatchState>();
let patchCount = 0;

export function isPatched(): boolean {
  return patchCount > 0;
}

export function _resetPatchState(): void {
  patchStates = new WeakMap<object, PatchState>();
  patchCount = 0;
}

export class ClaudeAgentSDKInstrumentation extends InstrumentationBase<ClaudeAgentSDKInstrumentationConfig> {
  constructor(config: ClaudeAgentSDKInstrumentationConfig = {}) {
    const captureFromEnvironment = getBooleanEnvironmentValue(
      'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT'
    );
    super(PACKAGE_NAME, PACKAGE_VERSION, {
      ...config,
      captureMessageContent:
        captureFromEnvironment ?? !!config.captureMessageContent,
    });
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
      ['>=0.2.0 <1'],
      this._patch.bind(this),
      this._unpatch.bind(this)
    );
  }

  /**
   * Manually instrument an ESM module namespace.
   *
   * Immutable module namespaces cannot be patched in place, so callers must
   * use the returned module object.
   */
  manuallyInstrument<T extends object>(module: T): T {
    return this._patch(module as ClaudeAgentSDKModule) as T;
  }

  private _patch(
    module: ClaudeAgentSDKModule,
    moduleVersion?: string
  ): ClaudeAgentSDKModule {
    const sdkModule = getSDKModule(module);
    const existing = patchStates.get(sdkModule);
    if (existing) {
      return existing.target;
    }

    if (typeof sdkModule.query !== 'function') {
      this._diag.debug(
        `cannot find query export in @anthropic-ai/claude-agent-sdk@${moduleVersion}`
      );
      return module;
    }

    const target =
      !isModuleNamespace(sdkModule) && isPropertyWritable(sdkModule, 'query')
        ? sdkModule
        : { ...sdkModule };
    const originalQuery = sdkModule.query;
    target.query = wrapQuery({
      original: originalQuery,
      getTracer: () => this.tracer,
      getConfig: () => this.getConfig(),
      isEnabled: () => this.isEnabled(),
      diag: this._diag,
    });

    const state = { source: sdkModule, target, originalQuery };
    patchStates.set(sdkModule, state);
    patchStates.set(target, state);
    patchCount += 1;
    return target;
  }

  private _unpatch(module: ClaudeAgentSDKModule, moduleVersion?: string): void {
    const sdkModule = getSDKModule(module);
    const state = patchStates.get(sdkModule);
    if (!state) {
      this._diag.debug(
        `Claude Agent SDK module was not patched: ${moduleVersion}`
      );
      return;
    }

    if (isPropertyWritable(state.target, 'query')) {
      state.target.query = state.originalQuery;
    }
    patchStates.delete(state.source);
    patchStates.delete(state.target);
    patchCount = Math.max(0, patchCount - 1);
  }
}

function getSDKModule(module: ClaudeAgentSDKModule): ClaudeAgentSDKModule {
  return module.default ?? module;
}

function isPropertyWritable(module: object, property: string): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(module, property);
  if (!descriptor) {
    return true;
  }
  if (descriptor.get && !descriptor.set && !descriptor.configurable) {
    return false;
  }
  return descriptor.writable !== false;
}

function isModuleNamespace(module: object): boolean {
  return Object.prototype.toString.call(module) === '[object Module]';
}

function getBooleanEnvironmentValue(name: string): boolean | undefined {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }
  return value.toLowerCase() === 'true';
}
