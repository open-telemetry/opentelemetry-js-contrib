/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import type { InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { OpenAIAgentsInstrumentation } from '../src';
import type {
  OpenAIAgentsModule,
  OpenAIAgentsTracingProcessor,
} from '../src/internal-types';

interface MockModule extends OpenAIAgentsModule {
  added: OpenAIAgentsTracingProcessor[];
  replacements: OpenAIAgentsTracingProcessor[][];
  defaultsRestored: number;
}

function createMockModule(): MockModule {
  const module: MockModule = {
    added: [],
    replacements: [],
    defaultsRestored: 0,
    addTraceProcessor(processor) {
      module.added.push(processor);
    },
    setTraceProcessors(processors) {
      module.replacements.push(processors);
    },
    setDefaultOpenAITracingExporter() {
      module.defaultsRestored++;
    },
  };
  return module;
}

function getDefinition(
  instrumentation: OpenAIAgentsInstrumentation
): InstrumentationNodeModuleDefinition {
  return (
    instrumentation as unknown as {
      init(): InstrumentationNodeModuleDefinition[];
    }
  ).init()[0];
}

describe('OpenAIAgentsInstrumentation', () => {
  it('preserves the native OpenAI trace exporter by default', () => {
    const instrumentation = new OpenAIAgentsInstrumentation();
    const module = createMockModule();
    const definition = getDefinition(instrumentation);

    definition.patch!(module, '0.14.3');

    assert.strictEqual(module.added.length, 1);
    assert.strictEqual(module.replacements.length, 0);
    instrumentation.disable();
  });

  it('replaces native trace processors when export is disabled', () => {
    const instrumentation = new OpenAIAgentsInstrumentation({
      disableOpenAITraceExport: true,
    });
    const module = createMockModule();
    const definition = getDefinition(instrumentation);

    definition.patch!(module, '0.14.3');

    assert.strictEqual(module.added.length, 0);
    assert.strictEqual(module.replacements.length, 1);
    assert.strictEqual(module.replacements[0].length, 1);

    definition.unpatch!(module, '0.14.3');
    assert.strictEqual(module.defaultsRestored, 1);
    instrumentation.disable();
  });

  it('can switch registration modes through configuration', () => {
    const instrumentation = new OpenAIAgentsInstrumentation();
    const module = createMockModule();
    const definition = getDefinition(instrumentation);
    definition.patch!(module, '0.14.3');

    instrumentation.setConfig({ disableOpenAITraceExport: true });

    assert.strictEqual(module.added.length, 1);
    assert.strictEqual(module.replacements.length, 1);
    instrumentation.disable();
  });

  it('does not add a duplicate processor when re-enabled', () => {
    const instrumentation = new OpenAIAgentsInstrumentation();
    const module = createMockModule();
    const definition = getDefinition(instrumentation);

    definition.patch!(module, '0.14.3');
    definition.unpatch!(module, '0.14.3');
    definition.patch!(module, '0.14.3');

    assert.strictEqual(module.added.length, 1);
    instrumentation.disable();
  });
});
