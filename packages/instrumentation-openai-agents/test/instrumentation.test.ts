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
  processors: OpenAIAgentsTracingProcessor[];
  replacements: OpenAIAgentsTracingProcessor[][];
  defaultsRestored: number;
}

function createMockModule(): MockModule {
  class MockRunner {
    run(): Promise<unknown> {
      return Promise.resolve(undefined);
    }
  }
  const module: MockModule = {
    Runner: MockRunner,
    withTrace: async (_trace, fn) => fn({ traceId: 'mock-trace' }),
    added: [],
    processors: [],
    replacements: [],
    defaultsRestored: 0,
    addTraceProcessor(processor) {
      module.added.push(processor);
      module.processors.push(processor);
    },
    setTraceProcessors(processors) {
      module.replacements.push(processors);
      module.processors = [...processors];
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

    const applicationProcessor = {} as OpenAIAgentsTracingProcessor;
    module.addTraceProcessor(applicationProcessor);
    definition.unpatch!(module, '0.14.3');
    assert.strictEqual(module.defaultsRestored, 0);
    assert.ok(module.processors.includes(applicationProcessor));
    instrumentation.disable();
  });

  it('does not destructively switch registration modes through configuration', () => {
    const instrumentation = new OpenAIAgentsInstrumentation();
    const module = createMockModule();
    const definition = getDefinition(instrumentation);
    definition.patch!(module, '0.14.3');

    instrumentation.setConfig({ disableOpenAITraceExport: true });

    assert.strictEqual(module.added.length, 1);
    assert.strictEqual(module.replacements.length, 0);
    assert.strictEqual(
      instrumentation.getConfig().disableOpenAITraceExport,
      false
    );
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

  it('reports Runner.run rejections to the tracing processor', async () => {
    const instrumentation = new OpenAIAgentsInstrumentation();
    const module = createMockModule();
    const failure = new Error('run failed');
    module.Runner.prototype.run = async () => {
      throw failure;
    };
    const definition = getDefinition(instrumentation);
    definition.patch!(module, '0.14.0');

    const processor = module.processors[0] as OpenAIAgentsTracingProcessor & {
      onRunError(runToken: object, error: unknown): void;
    };
    const originalOnRunError = processor.onRunError.bind(processor);
    let reportedError: unknown;
    processor.onRunError = (runToken, error) => {
      reportedError = error;
      originalOnRunError(runToken, error);
    };

    await assert.rejects(module.Runner.prototype.run(), failure);
    assert.strictEqual(reportedError, failure);

    definition.unpatch!(module, '0.14.0');
    instrumentation.disable();
  });

  it('preserves the environment capture override across setConfig', () => {
    const key = 'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT';
    const previous = process.env[key];
    process.env[key] = 'true';

    try {
      const instrumentation = new OpenAIAgentsInstrumentation({
        captureMessageContent: false,
      });
      assert.strictEqual(
        instrumentation.getConfig().captureMessageContent,
        true
      );

      instrumentation.setConfig({ enabled: true });
      assert.strictEqual(
        instrumentation.getConfig().captureMessageContent,
        true
      );
      instrumentation.disable();
    } finally {
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  });
});
