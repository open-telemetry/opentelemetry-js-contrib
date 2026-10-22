/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { diag, Tracer } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import {
  isEmbeddingPrototype,
  isRetrieverPrototype,
  patchQueryEmbeddingMethod,
  patchQueryEngineQueryMethod,
  patchRetrieveMethod,
} from './utils';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import type { LlamaIndexInstrumentationConfig } from './types';

const MODULE_NAME = 'llamaindex';
const SUPPORTED_VERSIONS = ['>=0.1.0'];

let _lastInstance: LlamaIndexInstrumentation | undefined;

/**
 * Checks if the LlamaIndex module has been patched.
 */
export function isPatched(moduleExports?: object): boolean {
  return _lastInstance?.isPatched(moduleExports) ?? false;
}

export class LlamaIndexInstrumentation extends InstrumentationBase {
  private _manualModuleExports?: Record<string, unknown>;
  private _patchedTargets = new Set<Record<string, unknown>>();

  public override get tracer(): Tracer {
    return super.tracer;
  }

  constructor(config?: LlamaIndexInstrumentationConfig) {
    super(PACKAGE_NAME, PACKAGE_VERSION, Object.assign({}, config));
    _lastInstance = this;
  }

  public isPatched(moduleExports?: object): boolean {
    if (moduleExports) {
      return this._patchedTargets.has(moduleExports as Record<string, unknown>);
    }
    return this._patchedTargets.size > 0;
  }

  public manuallyInstrument(moduleExports: Record<string, unknown>): void {
    diag.debug(`Manually instrumenting ${MODULE_NAME}`);
    this._manualModuleExports = moduleExports;
    this._patch(moduleExports);
  }

  public manuallyUninstrument(moduleExports?: Record<string, unknown>): void {
    if (moduleExports) {
      this._unpatch(moduleExports);
    } else {
      for (const target of Array.from(this._patchedTargets)) {
        this._unpatch(target);
      }
      this._patchedTargets.clear();
      this._manualModuleExports = undefined;
    }
  }

  override disable(): void {
    super.disable();
    for (const target of Array.from(this._patchedTargets)) {
      this._unpatch(target);
    }
    this._patchedTargets.clear();
    this._manualModuleExports = undefined;
  }

  protected init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      MODULE_NAME,
      SUPPORTED_VERSIONS,
      this._patch.bind(this),
      this._unpatch.bind(this)
    );
    return module;
  }

  private _patch(
    moduleExports: Record<string, unknown>,
    moduleVersion?: string
  ): Record<string, unknown> {
    this._diag.debug(`Applying patch for ${MODULE_NAME}@${moduleVersion}`);
    if (this._patchedTargets.has(moduleExports)) {
      return moduleExports;
    }

    // Patch RetrieverQueryEngine if present
    const queryEngine = moduleExports.RetrieverQueryEngine as
      | { prototype?: Record<string, unknown> }
      | undefined;
    const queryEngineProto = queryEngine?.prototype;

    if (queryEngineProto && typeof queryEngineProto.query === 'function') {
      this._wrap(
        queryEngineProto,
        'query',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (original: any) => {
          return patchQueryEngineQueryMethod(this, original);
        }
      );
    }

    // Patch any exported classes that implement retriever or embedding prototypes
    for (const value of Object.values(moduleExports)) {
      if (
        value != null &&
        typeof value === 'function' &&
        'prototype' in value
      ) {
        const prototype = (value as { prototype: unknown }).prototype;

        // Prevent double-wrapping: do not wrap queryEngine as a retriever
        if (isRetrieverPrototype(prototype) && prototype !== queryEngineProto) {
          this._wrap(
            prototype as Record<string, unknown>,
            'retrieve',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (original: any) => {
              return patchRetrieveMethod(this, original);
            }
          );
        }

        if (isEmbeddingPrototype(prototype)) {
          this._wrap(
            prototype as Record<string, unknown>,
            'getQueryEmbedding',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (original: any) => {
              return patchQueryEmbeddingMethod(this, original);
            }
          );
        }
      }
    }

    this._patchedTargets.add(moduleExports);
    return moduleExports;
  }

  private _unpatch(
    moduleExports: Record<string, unknown>,
    moduleVersion?: string
  ): void {
    this._diag.debug(`Un-patching ${MODULE_NAME}@${moduleVersion}`);
    if (!this._patchedTargets.has(moduleExports)) {
      return;
    }

    const queryEngine = moduleExports.RetrieverQueryEngine as
      | { prototype?: Record<string, unknown> }
      | undefined;
    const queryEngineProto = queryEngine?.prototype;

    if (queryEngineProto && typeof queryEngineProto.query === 'function') {
      this._unwrap(queryEngineProto, 'query');
    }

    for (const value of Object.values(moduleExports)) {
      if (
        value != null &&
        typeof value === 'function' &&
        'prototype' in value
      ) {
        const prototype = (value as { prototype: unknown }).prototype;

        if (isRetrieverPrototype(prototype) && prototype !== queryEngineProto) {
          this._unwrap(prototype as Record<string, unknown>, 'retrieve');
        }

        if (isEmbeddingPrototype(prototype)) {
          this._unwrap(
            prototype as Record<string, unknown>,
            'getQueryEmbedding'
          );
        }
      }
    }

    this._patchedTargets.delete(moduleExports);
  }
}
