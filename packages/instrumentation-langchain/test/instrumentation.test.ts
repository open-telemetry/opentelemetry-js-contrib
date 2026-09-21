/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LangChainInstrumentation } from '../src';
import type { InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { expect } from 'expect';

describe('LangChainInstrumentation', () => {
  let instrumentation: LangChainInstrumentation;

  beforeEach(() => {
    instrumentation = new LangChainInstrumentation();
  });

  afterEach(() => {
    instrumentation.disable();
  });

  it('patches every loaded module copy without touching streaming methods', () => {
    class TestInstrumentation extends LangChainInstrumentation {
      declare definitions: InstrumentationNodeModuleDefinition[];
      protected override init() {
        this.definitions = super.init();
        return this.definitions;
      }
    }
    const instance = new TestInstrumentation({ enabled: false });
    const file = instance.definitions[0].files.find(file =>
      file.name.endsWith('base.cjs')
    )!;
    function module() {
      return {
        RunnableSequence: class {
          getName() {
            return 'sequence';
          }
          invoke(value: unknown) {
            return value;
          }
          batch(value: unknown) {
            return value;
          }
          stream() {}
          transform() {}
        },
        RunnableMap: class {
          getName() {
            return 'map';
          }
          invoke(value: unknown) {
            return value;
          }
          stream() {}
          transform() {}
        },
      };
    }
    const modules = [module(), module(), module()];
    const originals = modules.map(copy => ({
      invoke: copy.RunnableSequence.prototype.invoke,
      batch: copy.RunnableSequence.prototype.batch,
      map: copy.RunnableMap.prototype.invoke,
      stream: copy.RunnableSequence.prototype.stream,
      transform: copy.RunnableMap.prototype.transform,
    }));
    try {
      instance.enable();
      for (const copy of modules.slice(0, 2)) {
        file.moduleExports = copy;
        file.patch(copy);
      }
      instance.disable();
      file.moduleExports = modules[2];
      for (let cycle = 0; cycle < 2; cycle++) {
        instance.enable();
        instance.enable();
        for (const [index, copy] of modules.entries()) {
          expect(copy.RunnableSequence.prototype.invoke).not.toBe(
            originals[index].invoke
          );
          expect(copy.RunnableSequence.prototype.batch).not.toBe(
            originals[index].batch
          );
          expect(copy.RunnableMap.prototype.invoke).not.toBe(
            originals[index].map
          );
          expect(copy.RunnableSequence.prototype.stream).toBe(
            originals[index].stream
          );
          expect(copy.RunnableMap.prototype.transform).toBe(
            originals[index].transform
          );
          const result = { answer: 'same object' };
          expect(new copy.RunnableSequence().invoke(result)).toBe(result);
        }
        instance.disable();
        instance.disable();
        for (const [index, copy] of modules.entries()) {
          expect(copy.RunnableSequence.prototype.invoke).toBe(
            originals[index].invoke
          );
          expect(copy.RunnableSequence.prototype.batch).toBe(
            originals[index].batch
          );
          expect(copy.RunnableMap.prototype.invoke).toBe(originals[index].map);
        }
      }
    } finally {
      instance.disable();
    }
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(instrumentation).toBeInstanceOf(LangChainInstrumentation);
    });

    it('should have correct instrumentationName', () => {
      expect(instrumentation.instrumentationName).toBe(
        '@opentelemetry/instrumentation-langchain'
      );
    });
  });

  describe('setConfig', () => {
    it('should normalize captureMessageContent config', () => {
      const instr = new LangChainInstrumentation({
        captureMessageContent: true,
      });
      const config = instr.getConfig();
      expect(config.captureMessageContent).toBe(true);
      instr.disable();
    });

    it('should default captureMessageContent to false', () => {
      const config = instrumentation.getConfig();
      expect(config.captureMessageContent).toBe(false);
    });

    describe('content capture environment', () => {
      const key = 'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT';
      let previous: string | undefined;
      beforeEach(() => {
        previous = process.env[key];
      });
      afterEach(() => {
        if (previous === undefined) delete process.env[key];
        else process.env[key] = previous;
      });

      for (const [value, expected] of [
        ['TRUE', true],
        ['false', false],
      ] as const) {
        it(`honors ${value} over the constructor setting but allows later config updates`, () => {
          process.env[key] = value;
          const instance = new LangChainInstrumentation({
            enabled: false,
            captureMessageContent: !expected,
          });
          expect(instance.getConfig().captureMessageContent).toBe(expected);
          instance.setConfig({
            enabled: false,
            captureMessageContent: !expected,
          });
          expect(instance.getConfig().captureMessageContent).toBe(!expected);
          instance.setConfig({ enabled: false });
          expect(instance.getConfig().captureMessageContent).toBe(false);
        });
      }

      for (const value of ['invalid', 'span_only', 'none', ' true ']) {
        it(`ignores ${value} rather than changing the boolean capture API`, () => {
          process.env[key] = value;
          const instance = new LangChainInstrumentation({ enabled: false });
          expect(instance.getConfig().captureMessageContent).toBe(false);
        });
      }
    });
  });
});
