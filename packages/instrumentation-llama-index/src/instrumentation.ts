/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { diag } from '@opentelemetry/api';
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

let _isLlamaIndexPatched = false;

/**
 * Checks if the LlamaIndex module has been patched.
 */
export function isPatched(): boolean {
  return _isLlamaIndexPatched;
}

export class LlamaIndexInstrumentation extends InstrumentationBase {
  private _manualModuleExports?: Record<string, unknown>;

  constructor(config?: LlamaIndexInstrumentationConfig) {
    super(PACKAGE_NAME, PACKAGE_VERSION, Object.assign({}, config));
  }

  public manuallyInstrument(moduleExports: Record<string, unknown>): void {
    diag.debug(`Manually instrumenting ${MODULE_NAME}`);
    this._manualModuleExports = moduleExports;
    this._patch(moduleExports);
  }

  public manuallyUninstrument(moduleExports?: Record<string, unknown>): void {
    const target = moduleExports ?? this._manualModuleExports;
    if (target) {
      this._unpatch(target);
      this._manualModuleExports = undefined;
    }
  }

  override disable(): void {
    super.disable();
    if (this._manualModuleExports) {
      this._unpatch(this._manualModuleExports);
      this._manualModuleExports = undefined;
    }
    _isLlamaIndexPatched = false;
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
    if (_isLlamaIndexPatched) {
      return moduleExports;
    }

    const config = this.getConfig() as LlamaIndexInstrumentationConfig;

    // Patch RetrieverQueryEngine if present
    const queryEngine = moduleExports.RetrieverQueryEngine as
      | { prototype?: Record<string, unknown> }
      | undefined;
    if (
      queryEngine?.prototype &&
      typeof queryEngine.prototype.query === 'function'
    ) {
      this._wrap(
        queryEngine.prototype,
        'query',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (original: any) => {
          return patchQueryEngineQueryMethod(original, this.tracer, config);
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

        if (isRetrieverPrototype(prototype)) {
          this._wrap(
            prototype as Record<string, unknown>,
            'retrieve',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (original: any) => {
              return patchRetrieveMethod(original, this.tracer, config);
            }
          );
        }

        if (isEmbeddingPrototype(prototype)) {
          this._wrap(
            prototype as Record<string, unknown>,
            'getQueryEmbedding',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (original: any) => {
              return patchQueryEmbeddingMethod(original, this.tracer);
            }
          );
        }
      }
    }

    _isLlamaIndexPatched = true;
    return moduleExports;
  }

  private _unpatch(
    moduleExports: Record<string, unknown>,
    moduleVersion?: string
  ): void {
    this._diag.debug(`Un-patching ${MODULE_NAME}@${moduleVersion}`);

    const queryEngine = moduleExports.RetrieverQueryEngine as
      | { prototype?: Record<string, unknown> }
      | undefined;
    if (
      queryEngine?.prototype &&
      typeof queryEngine.prototype.query === 'function'
    ) {
      this._unwrap(queryEngine.prototype, 'query');
    }

    for (const value of Object.values(moduleExports)) {
      if (
        value != null &&
        typeof value === 'function' &&
        'prototype' in value
      ) {
        const prototype = (value as { prototype: unknown }).prototype;

        if (isRetrieverPrototype(prototype)) {
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

    _isLlamaIndexPatched = false;
  }
}
