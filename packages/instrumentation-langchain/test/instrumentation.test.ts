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

  it('patches and unpatches every loaded copy of a module', () => {
    class TestInstrumentation extends LangChainInstrumentation {
      declare definitions: InstrumentationNodeModuleDefinition[];

      protected override init() {
        this.definitions = super.init();
        return this.definitions;
      }
    }
    const instance = new TestInstrumentation({ enabled: false });
    const file = instance.definitions
      .find(module => module.name === 'langchain')!
      .files.find(file => file.name.endsWith('ReactAgent.cjs'))!;
    const modules = Array.from({ length: 2 }, () => ({
      ReactAgent: class {
        invoke() {}
        stream() {}
      },
    }));
    const originals = modules.map(module => ({
      invoke: module.ReactAgent.prototype.invoke,
      stream: module.ReactAgent.prototype.stream,
    }));
    try {
      instance.enable();
      for (const module of modules) {
        file.moduleExports = module;
        file.patch(module);
      }
      for (let cycle = 0; cycle < 2; cycle++) {
        for (const [index, module] of modules.entries()) {
          expect(module.ReactAgent.prototype.invoke).not.toBe(
            originals[index].invoke
          );
          expect(module.ReactAgent.prototype.stream).not.toBe(
            originals[index].stream
          );
        }
        instance.disable();
        for (const [index, module] of modules.entries()) {
          expect(module.ReactAgent.prototype.invoke).toBe(
            originals[index].invoke
          );
          expect(module.ReactAgent.prototype.stream).toBe(
            originals[index].stream
          );
        }
        instance.enable();
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
        it(`honors ${value} over the constructor setting`, () => {
          process.env[key] = value;
          const instance = new LangChainInstrumentation({
            enabled: false,
            captureMessageContent: !expected,
          });
          expect(instance.getConfig().captureMessageContent).toBe(expected);
        });
      }

      it('ignores invalid values rather than enabling content capture', () => {
        process.env[key] = 'invalid';
        const instance = new LangChainInstrumentation({ enabled: false });
        expect(instance.getConfig().captureMessageContent).toBe(false);
      });
    });
  });
});
