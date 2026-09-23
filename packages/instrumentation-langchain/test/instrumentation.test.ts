/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LangChainInstrumentation } from '../src';
import type { LangChainInstrumentationConfig } from '../src';
import { diag, DiagLogLevel } from '@opentelemetry/api';
import type { InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { expect } from 'expect';
import * as sinon from 'sinon';
import { normalize } from 'node:path';

describe('LangChainInstrumentation', () => {
  let instrumentation: LangChainInstrumentation;
  const key = 'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT';
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env[key];
    delete process.env[key];
    instrumentation = new LangChainInstrumentation();
  });

  afterEach(() => {
    instrumentation.disable();
    diag.disable();
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
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
    expect(instance.instrumentationName).toBe(
      '@opentelemetry/instrumentation-langchain'
    );
    expect(instance.definitions.map(definition => definition.name)).toEqual([
      '@langchain/core',
    ]);
    expect(instance.definitions[0].files.map(file => file.name)).toEqual([
      normalize('@langchain/core/dist/runnables/base.cjs'),
      normalize('@langchain/core/dist/runnables/base.js'),
    ]);
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
    it('defaults to none, accepts both canonical modes and resets to none', () => {
      expect(instrumentation.getConfig().captureMessageContent).toBe('none');
      for (const mode of ['span_only', 'none'] as const) {
        instrumentation.setConfig({ captureMessageContent: mode });
        expect(instrumentation.getConfig().captureMessageContent).toBe(mode);
      }
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      instrumentation.setConfig({});
      expect(instrumentation.getConfig().captureMessageContent).toBe('none');
    });

    it('rejects boolean TypeScript configuration and safely handles invalid JavaScript values', () => {
      const booleanConfig: LangChainInstrumentationConfig = {
        enabled: false,
        // @ts-expect-error Boolean content capture is no longer part of the API.
        captureMessageContent: true,
      };
      const warn = sinon.spy();
      diag.setLogger(
        {
          error() {},
          warn,
          info() {},
          debug() {},
          verbose() {},
        },
        DiagLogLevel.WARN
      );
      for (const value of [
        booleanConfig.captureMessageContent,
        false,
        'true',
        'false',
        'span',
        'no_content',
        '',
        null,
        1,
        'SPAN_ONLY',
        ' span_only ',
        {
          toString() {
            throw new Error('private value');
          },
        },
      ]) {
        const instance: LangChainInstrumentation = Reflect.construct(
          LangChainInstrumentation,
          [{ enabled: false, captureMessageContent: value }]
        );
        expect(instance.getConfig().captureMessageContent).toBe('none');
        instance.setConfig({
          enabled: false,
          captureMessageContent: 'span_only',
        });
        Reflect.apply(instance.setConfig, instance, [
          { enabled: false, captureMessageContent: value },
        ]);
        expect(instance.getConfig().captureMessageContent).toBe('none');
      }
      expect(warn.callCount).toBe(24);
      for (const args of warn.args)
        expect(args.at(-1)).toBe(
          'LangChain: invalid captureMessageContent mode; using none'
        );
    });

    describe('content capture environment', () => {
      for (const [value, expected] of [
        ['span_only', 'span_only'],
        [' SPAN_ONLY ', 'span_only'],
        ['none', 'none'],
        [' NONE ', 'none'],
      ] as const) {
        it(`honors ${value} over the constructor setting but allows later config updates`, () => {
          process.env[key] = value;
          const opposite = expected === 'span_only' ? 'none' : 'span_only';
          const instance = new LangChainInstrumentation({
            enabled: false,
            captureMessageContent: opposite,
          });
          expect(instance.getConfig().captureMessageContent).toBe(expected);
          instance.setConfig({
            enabled: false,
            captureMessageContent: opposite,
          });
          expect(instance.getConfig().captureMessageContent).toBe(opposite);
          instance.setConfig({ enabled: false });
          expect(instance.getConfig().captureMessageContent).toBe('none');
        });
      }

      for (const value of [undefined, '', ' \t ']) {
        it(`preserves explicit configuration for an unset or blank environment (${JSON.stringify(value)})`, () => {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
          const instance = new LangChainInstrumentation({
            enabled: false,
            captureMessageContent: 'span_only',
          });
          expect(instance.getConfig().captureMessageContent).toBe('span_only');
        });
      }

      for (const value of [
        'true',
        'false',
        ' TRUE ',
        'span',
        'no_content',
        'private-invalid',
      ]) {
        it(`fails closed for invalid environment ${value} even with enabled constructor capture`, () => {
          const warn = sinon.spy();
          diag.setLogger(
            {
              error() {},
              warn,
              info() {},
              debug() {},
              verbose() {},
            },
            DiagLogLevel.WARN
          );
          process.env[key] = value;
          const instance = new LangChainInstrumentation({
            enabled: false,
            captureMessageContent: 'span_only',
          });
          expect(instance.getConfig().captureMessageContent).toBe('none');
          expect(warn.callCount).toBe(1);
          expect(warn.firstCall.args).toEqual([
            '@opentelemetry/instrumentation-langchain',
            'LangChain: invalid captureMessageContent mode; using none',
          ]);
          instance.setConfig({
            enabled: false,
            captureMessageContent: 'span_only',
          });
          expect(instance.getConfig().captureMessageContent).toBe('span_only');
        });
      }
    });
  });
});
