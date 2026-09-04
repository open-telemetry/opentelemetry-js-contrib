/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { diag } from '@opentelemetry/api';
import type { DiagLogger } from '@opentelemetry/api';
import type { CompletionHook, CompletionResult } from './types';

/**
 * Manages registration and safe execution of GenAI completion hooks.
 *
 * @experimental This class is experimental and subject to change.
 */
export class CompletionHookManager {
  private _hooks: CompletionHook[] = [];

  constructor(hooks: CompletionHook[] = []) {
    this._hooks = [...hooks];
  }

  /**
   * Register a new completion hook.
   */
  public addHook(hook: CompletionHook): this {
    if (hook && typeof hook.onCompletion === 'function') {
      this._hooks.push(hook);
    }
    return this;
  }

  /**
   * Unregister an existing completion hook.
   */
  public removeHook(hook: CompletionHook): this {
    this._hooks = this._hooks.filter(h => h !== hook);
    return this;
  }

  /**
   * Return list of registered hooks.
   */
  public getHooks(): CompletionHook[] {
    return [...this._hooks];
  }

  /**
   * Remove all registered hooks.
   */
  public clearHooks(): void {
    this._hooks = [];
  }

  /**
   * Execute all registered completion hooks safely.
   * Any errors thrown by hooks will be logged without interrupting application execution.
   */
  public async execute(
    result: CompletionResult,
    diag_: DiagLogger = diag
  ): Promise<void> {
    if (this._hooks.length === 0) {
      return;
    }

    const promises = this._hooks.map(async hook => {
      try {
        await hook.onCompletion(result);
      } catch (err) {
        diag_.warn('Error executing GenAI completion hook:', err);
      }
    });

    await Promise.all(promises);
  }
}
