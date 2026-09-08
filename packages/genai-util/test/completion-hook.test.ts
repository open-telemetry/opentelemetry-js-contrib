/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { trace } from '@opentelemetry/api';
import { CompletionHookManager } from '../src/completion-hook';
import type { CompletionResult } from '../src/types';

describe('CompletionHookManager', () => {
  it('should register and execute completion hooks', async () => {
    const manager = new CompletionHookManager();
    let executed = false;
    let receivedResult: CompletionResult | undefined;

    const hook = {
      onCompletion(result: CompletionResult) {
        executed = true;
        receivedResult = result;
      },
    };

    manager.addHook(hook);
    assert.strictEqual(manager.getHooks().length, 1);

    const dummySpan = trace.getTracer('test').startSpan('test-span');
    const result: CompletionResult = {
      span: dummySpan,
      providerName: 'openai',
      requestModel: 'gpt-4o',
      durationSeconds: 0.5,
    };

    await manager.execute(result);
    assert.strictEqual(executed, true);
    assert.strictEqual(receivedResult?.providerName, 'openai');
    assert.strictEqual(receivedResult?.requestModel, 'gpt-4o');

    manager.removeHook(hook);
    assert.strictEqual(manager.getHooks().length, 0);

    manager.addHook(hook);
    manager.clearHooks();
    assert.strictEqual(manager.getHooks().length, 0);
  });

  it('should handle hook execution errors gracefully without throwing', async () => {
    const manager = new CompletionHookManager();
    const failingHook = {
      onCompletion() {
        throw new Error('Hook failure');
      },
    };

    manager.addHook(failingHook);
    const dummySpan = trace.getTracer('test').startSpan('test-span');

    // Should not throw
    await manager.execute({
      span: dummySpan,
      providerName: 'anthropic',
    });
  });
});
