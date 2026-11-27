/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MeterProvider, TracerProvider } from '@opentelemetry/api';
import { TelemetryHandler } from '@opentelemetry/genai-util';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import type { BaseAgent } from 'beeai-framework/agents/base';
import type { ChatModel } from 'beeai-framework/backend/chat';
import type { EmbeddingModel } from 'beeai-framework/backend/embedding';
import type { Tool } from 'beeai-framework/tools/base';
import {
  createAgentOperationSpec,
  createToolOperationSpec,
} from './agent-operations';
import type { PatchOwner } from './internal-types';
import {
  createChatOperationSpec,
  createEmbeddingOperationSpec,
} from './model-operations';
import { patchRunMethod, unpatchMethod } from './run-patching';
import type { BeeAIInstrumentationConfig } from './types';
import { isRecord } from './utils';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

const MODULE_NAME = 'beeai-framework';
const SUPPORTED_VERSIONS = ['>=0.1.9 <0.1.14'];

const AGENT_OPERATION_SPEC = createAgentOperationSpec();
const TOOL_OPERATION_SPEC = createToolOperationSpec();
const CHAT_OPERATION_SPEC = createChatOperationSpec(false);
const STRUCTURED_CHAT_OPERATION_SPEC = createChatOperationSpec(true);
const EMBEDDING_OPERATION_SPEC = createEmbeddingOperationSpec();

/**
 * OpenTelemetry instrumentation for `beeai-framework`.
 */
export class BeeAIInstrumentation extends InstrumentationBase<BeeAIInstrumentationConfig> {
  declare private _telemetryHandler: TelemetryHandler | undefined;
  declare private _explicitTracerProvider: TracerProvider | undefined;
  declare private _explicitMeterProvider: MeterProvider | undefined;
  declare private _lastCaptureEnv: string | undefined;
  declare private _manualTargets: Set<object> | undefined;
  declare private _patchOwner: PatchOwner | undefined;

  /**
   * Initializes the BeeAI instrumentation with optional configuration.
   */
  constructor(config: BeeAIInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  /**
   * Enables instrumentation and re-applies patches to any manually instrumented
   * module targets.
   */
  override enable(): void {
    super.enable();
    if (this._manualTargets) {
      for (const target of this._manualTargets) {
        this._patchModule(target);
      }
    }
  }

  /**
   * Disables instrumentation and removes patches from any manually instrumented
   * module targets.
   */
  override disable(): void {
    super.disable();
    if (this._manualTargets) {
      for (const target of this._manualTargets) {
        this._unpatchModule(target);
      }
    }
  }

  /**
   * Updates instrumentation configuration and invalidates the cached
   * `TelemetryHandler`.
   */
  override setConfig(config: BeeAIInstrumentationConfig = {}): void {
    super.setConfig(config);
    this._telemetryHandler = undefined;
  }

  /**
   * Sets an explicit `TracerProvider` and resets the cached `TelemetryHandler`.
   */
  override setTracerProvider(tracerProvider: TracerProvider): void {
    super.setTracerProvider(tracerProvider);
    this._explicitTracerProvider = tracerProvider;
    this._telemetryHandler = undefined;
  }

  /**
   * Sets an explicit `MeterProvider` and resets the cached `TelemetryHandler`.
   */
  override setMeterProvider(meterProvider: MeterProvider): void {
    super.setMeterProvider(meterProvider);
    this._explicitMeterProvider = meterProvider;
    this._telemetryHandler = undefined;
  }

  /**
   * Lazily creates and caches the `TelemetryHandler`, recreating it if
   * `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` changes.
   */
  private _getTelemetryHandler(): TelemetryHandler {
    const config = this.getConfig();
    const currentEnv =
      process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
    if (!this._telemetryHandler || this._lastCaptureEnv !== currentEnv) {
      this._lastCaptureEnv = currentEnv;
      this._telemetryHandler = new TelemetryHandler({
        instrumentationName: PACKAGE_NAME,
        instrumentationVersion: PACKAGE_VERSION,
        tracerProvider: this._explicitTracerProvider,
        meterProvider: this._explicitMeterProvider,
        diag: this._diag,
        config,
      });
    }
    return this._telemetryHandler;
  }

  /**
   * Returns a stable internal {@link PatchOwner} handle for this instance.
   */
  private _getPatchOwner(): PatchOwner {
    if (!this._patchOwner) {
      this._patchOwner = {
        isEnabled: () => this.isEnabled(),
        getTelemetryHandler: () => this._getTelemetryHandler(),
        getDiag: () => this._diag,
      };
    }
    return this._patchOwner;
  }

  /**
   * Registers automatic CJS/ESM module hooks for `beeai-framework` and its
   * agent, tool, chat, and embedding subpath modules.
   */
  protected init() {
    const files = ['cjs', 'js'].flatMap(ext => [
      createTrackedModuleFile(
        `${MODULE_NAME}/dist/agents/base.${ext}`,
        (mod: { BaseAgent?: typeof BaseAgent }) =>
          this._patchBaseAgent(mod.BaseAgent),
        (mod: { BaseAgent?: typeof BaseAgent }) =>
          this._unpatchBaseAgent(mod.BaseAgent)
      ),
      createTrackedModuleFile(
        `${MODULE_NAME}/dist/tools/base.${ext}`,
        (mod: { Tool?: typeof Tool }) => this._patchTool(mod.Tool),
        (mod: { Tool?: typeof Tool }) => this._unpatchTool(mod.Tool)
      ),
      createTrackedModuleFile(
        `${MODULE_NAME}/dist/backend/chat.${ext}`,
        (mod: { ChatModel?: typeof ChatModel }) =>
          this._patchChatModel(mod.ChatModel),
        (mod: { ChatModel?: typeof ChatModel }) =>
          this._unpatchChatModel(mod.ChatModel)
      ),
      createTrackedModuleFile(
        `${MODULE_NAME}/dist/backend/embedding.${ext}`,
        (mod: { EmbeddingModel?: typeof EmbeddingModel }) =>
          this._patchEmbeddingModel(mod.EmbeddingModel),
        (mod: { EmbeddingModel?: typeof EmbeddingModel }) =>
          this._unpatchEmbeddingModel(mod.EmbeddingModel)
      ),
    ]);

    return [
      new InstrumentationNodeModuleDefinition(
        MODULE_NAME,
        SUPPORTED_VERSIONS,
        (moduleExports: unknown) => {
          this._patchModule(moduleExports);
          return moduleExports;
        },
        (moduleExports: unknown) => {
          this._unpatchModule(moduleExports);
        },
        files
      ),
    ];
  }

  /**
   * Manually instruments the `beeai-framework` module when not loaded via
   * automatic module hooks.
   */
  public manuallyInstrument(moduleExports: unknown): void {
    const target = this._normalizeModule(moduleExports);
    if (!target) {
      this._diag.warn(
        '[BeeAIInstrumentation] Invalid module passed to manuallyInstrument'
      );
      return;
    }
    if (
      'Version' in target &&
      typeof target.Version === 'string' &&
      !isSupportedVersion(target.Version)
    ) {
      const supportedVersionsString = `${MODULE_NAME} ["${SUPPORTED_VERSIONS.join('", "')}"]`;
      this._diag.warn(
        `DependencyConflict: requested: '${supportedVersionsString}' but found: '${MODULE_NAME} "${target.Version}"'`
      );
      return;
    }

    this._diag.debug(
      `[BeeAIInstrumentation] Manually instrumenting ${MODULE_NAME}`
    );
    this._manualTargets ??= new Set();
    this._manualTargets.add(target);
    if (this.isEnabled()) {
      this._patchModule(target);
    }
  }

  /**
   * Unwraps CJS/ESM module exports (including `default` exports) into an object
   * containing instrumentable BeeAI classes.
   */
  private _normalizeModule(moduleExports: unknown):
    | {
        BaseAgent?: typeof BaseAgent;
        Tool?: typeof Tool;
        ChatModel?: typeof ChatModel;
        EmbeddingModel?: typeof EmbeddingModel;
        Version?: string;
      }
    | undefined {
    if (!isRecord(moduleExports)) {
      return undefined;
    }
    if (
      'BaseAgent' in moduleExports ||
      'Tool' in moduleExports ||
      'ChatModel' in moduleExports ||
      'EmbeddingModel' in moduleExports
    ) {
      return moduleExports;
    }
    if ('default' in moduleExports && isRecord(moduleExports.default)) {
      return moduleExports.default;
    }
    return moduleExports;
  }

  /**
   * Patches all available BeeAI classes (`BaseAgent`, `Tool`, `ChatModel`,
   * `EmbeddingModel`) exported by a module object.
   */
  private _patchModule(moduleExports: unknown): void {
    const target = this._normalizeModule(moduleExports);
    if (!target) {
      return;
    }
    if (
      !target.BaseAgent &&
      !target.Tool &&
      !target.ChatModel &&
      !target.EmbeddingModel
    ) {
      this._diag.warn(
        '[BeeAIInstrumentation] No instrumentable BeeAI classes found, skipping instrumentation.'
      );
      return;
    }
    this._patchBaseAgent(target.BaseAgent);
    this._patchTool(target.Tool);
    this._patchChatModel(target.ChatModel);
    this._patchEmbeddingModel(target.EmbeddingModel);
  }

  /**
   * Removes instrumentation patches from all BeeAI classes exported by a module
   * object.
   */
  private _unpatchModule(moduleExports: unknown): void {
    const target = this._normalizeModule(moduleExports);
    if (!target) {
      return;
    }
    this._unpatchBaseAgent(target.BaseAgent);
    this._unpatchTool(target.Tool);
    this._unpatchChatModel(target.ChatModel);
    this._unpatchEmbeddingModel(target.EmbeddingModel);
  }

  private _patchBaseAgent(baseAgent: typeof BaseAgent | undefined): void {
    if (!baseAgent?.prototype) return;
    patchRunMethod(
      this._getPatchOwner(),
      baseAgent.prototype,
      'run',
      AGENT_OPERATION_SPEC
    );
  }

  private _unpatchBaseAgent(baseAgent: typeof BaseAgent | undefined): void {
    if (!baseAgent?.prototype) return;
    unpatchMethod(this._getPatchOwner(), baseAgent.prototype, 'run');
  }

  private _patchTool(tool: typeof Tool | undefined): void {
    if (!tool?.prototype) return;
    patchRunMethod(
      this._getPatchOwner(),
      tool.prototype,
      'run',
      TOOL_OPERATION_SPEC
    );
  }

  private _unpatchTool(tool: typeof Tool | undefined): void {
    if (!tool?.prototype) return;
    unpatchMethod(this._getPatchOwner(), tool.prototype, 'run');
  }

  private _patchChatModel(chatModel: typeof ChatModel | undefined): void {
    if (!chatModel?.prototype) return;
    const owner = this._getPatchOwner();
    patchRunMethod(owner, chatModel.prototype, 'create', CHAT_OPERATION_SPEC);
    patchRunMethod(
      owner,
      chatModel.prototype,
      'createStructure',
      STRUCTURED_CHAT_OPERATION_SPEC
    );
  }

  private _unpatchChatModel(chatModel: typeof ChatModel | undefined): void {
    if (!chatModel?.prototype) return;
    const owner = this._getPatchOwner();
    unpatchMethod(owner, chatModel.prototype, 'create');
    unpatchMethod(owner, chatModel.prototype, 'createStructure');
  }

  private _patchEmbeddingModel(
    embeddingModel: typeof EmbeddingModel | undefined
  ): void {
    if (!embeddingModel?.prototype) return;
    patchRunMethod(
      this._getPatchOwner(),
      embeddingModel.prototype,
      'create',
      EMBEDDING_OPERATION_SPEC
    );
  }

  private _unpatchEmbeddingModel(
    embeddingModel: typeof EmbeddingModel | undefined
  ): void {
    if (!embeddingModel?.prototype) return;
    unpatchMethod(this._getPatchOwner(), embeddingModel.prototype, 'create');
  }
}

/**
 * Checks whether a `beeai-framework` semantic version falls within the
 * supported `>=0.1.9 <0.1.14` range.
 */
function isSupportedVersion(version: unknown): boolean {
  if (typeof version !== 'string') return true;
  const match =
    /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      version.trim()
    );
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return major === 0 && minor === 1 && patch >= 9 && patch < 14;
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
      for (const instance of instances) {
        patch(instance);
      }
      return module;
    },
    () => {
      for (const instance of instances) {
        unpatch(instance);
      }
    }
  );
  let exports: T | undefined;
  Object.defineProperty(file, 'moduleExports', {
    get: () => exports,
    set: (module: T) => {
      exports = module;
      if (module && typeof module === 'object') {
        instances.add(module);
      }
    },
  });
  return file;
}
