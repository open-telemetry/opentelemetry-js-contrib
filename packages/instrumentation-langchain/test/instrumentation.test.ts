/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LangChainInstrumentation } from '../src';
import type { LangChainInstrumentationConfig } from '../src';
import { diag, DiagLogLevel } from '@opentelemetry/api';
import type { InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import {
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import { expect } from 'expect';
import * as sinon from 'sinon';
import { join, normalize } from 'node:path';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

class TestInstrumentation extends LangChainInstrumentation {
  declare definitions: InstrumentationNodeModuleDefinition[];
  protected override init() {
    this.definitions = super.init();
    return this.definitions;
  }
}

function runnableModule() {
  return {
    RunnableSequence: class {
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
      invoke(value: unknown) {
        return value;
      }
      stream() {}
      transform() {}
    },
  };
}

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

  it('selects SDK suites before loading tests only on supported Node versions', () => {
    const source = readFileSync(join(__dirname, '..', '.mocharc.js'), 'utf8');
    for (const version of [
      '18.19.0',
      '18.20.8',
      '20.6.0',
      '20.20.2',
      '24.21.0',
    ]) {
      const result = { exports: { spec: '', require: [], timeout: 0 } };
      const log = sinon.spy();
      const rootConfig = {
        require: ['ts-node/register/transpile-only'],
        timeout: 4000,
      };
      runInNewContext(source, {
        module: result,
        process: { versions: { node: version } },
        console: { log },
        require: (name: string) => {
          expect(name).toBe('../../.mocharc.json');
          return rootConfig;
        },
      });
      const supported = Number(version.split('.')[0]) >= 20;
      expect(result.exports.spec).toBe(
        supported ? 'test/**/*.test.ts' : 'test/instrumentation.test.ts'
      );
      expect(result.exports.require).toBe(rootConfig.require);
      expect(result.exports.timeout).toBe(rootConfig.timeout);
      expect(log.called).toBe(!supported);
    }
  });

  it('patches every loaded module copy without touching streaming methods', () => {
    const instance = new TestInstrumentation({ enabled: false });
    expect(instance.instrumentationName).toBe(
      '@opentelemetry/instrumentation-langchain'
    );
    expect(instance.definitions.map(definition => definition.name)).toEqual([
      '@langchain/core',
      'langchain',
    ]);
    expect(instance.definitions[0].files.map(file => file.name)).toEqual([
      normalize('@langchain/core/dist/runnables/base.cjs'),
      normalize('@langchain/core/dist/runnables/history.cjs'),
      normalize('@langchain/core/dist/runnables/passthrough.cjs'),
      normalize('@langchain/core/dist/language_models/chat_models.cjs'),
      normalize('@langchain/core/dist/language_models/structured_output.cjs'),
      normalize('@langchain/core/dist/runnables/base.js'),
      normalize('@langchain/core/dist/runnables/history.js'),
      normalize('@langchain/core/dist/runnables/passthrough.js'),
      normalize('@langchain/core/dist/language_models/chat_models.js'),
      normalize('@langchain/core/dist/language_models/structured_output.js'),
    ]);
    const file = instance.definitions[0].files.find(file =>
      file.name.endsWith('base.cjs')
    )!;
    const modules = [runnableModule(), runnableModule(), runnableModule()];
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
        resetMemoryExporter();
        for (const [index, copy] of modules.entries()) {
          const invoke = copy.RunnableSequence.prototype.invoke;
          const batchMethod = copy.RunnableSequence.prototype.batch;
          const map = copy.RunnableMap.prototype.invoke;
          file.patch(copy);
          file.patch(copy);
          expect(copy.RunnableSequence.prototype.invoke).toBe(invoke);
          expect(copy.RunnableSequence.prototype.batch).toBe(batchMethod);
          expect(copy.RunnableMap.prototype.invoke).toBe(map);
          expect(invoke).not.toBe(originals[index].invoke);
          expect(batchMethod).not.toBe(originals[index].batch);
          expect(map).not.toBe(originals[index].map);
          expect(copy.RunnableSequence.prototype.stream).toBe(
            originals[index].stream
          );
          expect(copy.RunnableMap.prototype.transform).toBe(
            originals[index].transform
          );
          const result = { answer: 'same object' };
          expect(new copy.RunnableSequence().invoke(result)).toBe(result);
          const batch = [result];
          expect(new copy.RunnableSequence().batch(batch)).toBe(batch);
          expect(new copy.RunnableMap().invoke(result)).toBe(result);
        }
        expect(getTestSpans()).toHaveLength(modules.length * 3);
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

  for (const firstDisabled of [0, 1]) {
    it(`keeps shared workflow patches active when instance ${firstDisabled + 1} is disabled first`, () => {
      const instances = [
        new TestInstrumentation({ enabled: false }),
        new TestInstrumentation({
          enabled: false,
          captureMessageContent: 'span_only',
        }),
      ];
      const copy = runnableModule();
      const methods = () => [
        copy.RunnableSequence.prototype.invoke,
        copy.RunnableSequence.prototype.batch,
        copy.RunnableMap.prototype.invoke,
      ];
      const originals = methods();
      const check = (owner?: number) => {
        resetMemoryExporter();
        expect(new copy.RunnableSequence().invoke('input')).toBe('input');
        const batch = ['input'];
        expect(new copy.RunnableSequence().batch(batch)).toBe(batch);
        expect(new copy.RunnableMap().invoke('input')).toBe('input');
        const spans = getTestSpans();
        expect(spans).toHaveLength(owner === undefined ? 0 : 3);
        for (const span of spans) {
          expect('gen_ai.input.messages' in span.attributes).toBe(owner === 1);
        }
      };
      try {
        for (const instance of instances) {
          instance.enable();
          const file = instance.definitions[0].files[0];
          file.moduleExports = copy;
          file.patch(copy);
        }
        for (let cycle = 0; cycle < 2; cycle++) {
          instances[0].enable();
          instances[1].enable();
          const wrappers = methods();
          for (const instance of instances) {
            instance.enable();
            instance.definitions[0].files[0].patch(copy);
          }
          expect(methods()).toEqual(wrappers);
          check(1);
          instances[firstDisabled].disable();
          instances[firstDisabled].disable();
          expect(methods()).toEqual(wrappers);
          check(1 - firstDisabled);
          instances[firstDisabled].enable();
          expect(methods()).toEqual(wrappers);
          check(firstDisabled);
          instances[1 - firstDisabled].disable();
          expect(methods()).toEqual(wrappers);
          check(firstDisabled);
          instances[firstDisabled].disable();
          expect(methods()).toEqual(originals);
          check();
          expect(
            wrappers[0].call(new copy.RunnableSequence(), 'saved wrapper')
          ).toBe('saved wrapper');
          expect(getTestSpans()).toHaveLength(0);
        }
      } finally {
        for (const instance of instances) instance.disable();
      }
    });
  }

  for (const installed of ['before', 'after']) {
    it(`preserves another wrapper installed ${installed} the workflow patch`, () => {
      const instance = new TestInstrumentation({ enabled: false });
      const copy = runnableModule();
      const target = copy.RunnableSequence.prototype;
      const original = target.invoke;
      const calls = sinon.spy();
      const unwrap = sinon.spy();
      const wrap = () => {
        const previous = target.invoke;
        const wrapper = Object.assign(
          function (this: typeof target, value: unknown) {
            calls();
            return previous.call(this, value);
          },
          {
            __original: previous,
            __wrapped: true,
            __unwrap: () => {
              unwrap();
              target.invoke = previous;
            },
          }
        );
        target.invoke = wrapper;
        return wrapper;
      };
      let otherWrapper = installed === 'before' ? wrap() : undefined;
      try {
        instance.enable();
        const file = instance.definitions[0].files[0];
        file.moduleExports = copy;
        file.patch(copy);
        if (installed === 'after') otherWrapper = wrap();
        for (let cycle = 0; cycle < 2; cycle++) {
          instance.enable();
          resetMemoryExporter();
          expect(new copy.RunnableSequence().invoke('enabled')).toBe('enabled');
          expect(getTestSpans()).toHaveLength(1);
          instance.disable();
          expect(target.invoke).toBe(otherWrapper);
          expect(new copy.RunnableSequence().invoke('disabled')).toBe(
            'disabled'
          );
          expect(getTestSpans()).toHaveLength(1);
        }
        expect(calls.callCount).toBe(4);
        expect(unwrap.called).toBe(false);
      } finally {
        instance.disable();
        target.invoke = original;
      }
    });
  }

  for (const method of ['invoke', 'batch'] as const) {
    for (const reenable of [false, true]) {
      it(`restores ${method} after outer wrappers are removed (re-enable=${reenable})`, () => {
        const first = new TestInstrumentation({ enabled: false });
        const second = new TestInstrumentation({ enabled: false });
        const copy = runnableModule();
        const target = copy.RunnableSequence.prototype;
        const original = target[method];
        const descriptor = Object.getOwnPropertyDescriptor(target, method);
        const receiver = new copy.RunnableSequence();
        const result = ['input'];
        const wrap = () => {
          const previous = target[method];
          const wrapper = function (this: typeof target, value: unknown) {
            expect(this).toBe(receiver);
            expect(value).toBe(result);
            return previous.call(this, value);
          };
          target[method] = wrapper;
          return {
            wrapper,
            unwrap: () => {
              target[method] = previous;
            },
          };
        };
        try {
          for (const instance of [first, second]) {
            instance.enable();
            const file = instance.definitions[0].files[0];
            file.moduleExports = copy;
            file.patch(copy);
          }
          const workflowWrapper = target[method];
          const inner = wrap();
          const outer = wrap();
          first.disable();
          resetMemoryExporter();
          expect(receiver[method](result)).toBe(result);
          expect(getTestSpans()).toHaveLength(1);
          second.disable();
          resetMemoryExporter();
          expect(receiver[method](result)).toBe(result);
          expect(target[method]).toBe(outer.wrapper);
          expect(getTestSpans()).toHaveLength(0);
          outer.unwrap();
          expect(receiver[method](result)).toBe(result);
          expect(target[method]).toBe(inner.wrapper);
          expect(getTestSpans()).toHaveLength(0);
          if (reenable) first.enable();
          inner.unwrap();
          expect(target[method]).toBe(workflowWrapper);
          expect(receiver[method](result)).toBe(result);
          expect(getTestSpans()).toHaveLength(reenable ? 1 : 0);
          if (reenable) {
            expect(target[method]).toBe(workflowWrapper);
            first.disable();
          }
          expect(target[method]).toBe(original);
          expect(Object.getOwnPropertyDescriptor(target, method)).toEqual(
            descriptor
          );

          // Cleanup must remove the registry entry as well as the wrapper.
          first.enable();
          const replacement = target[method];
          expect(replacement).not.toBe(original);
          expect(replacement).not.toBe(workflowWrapper);
          resetMemoryExporter();
          expect(workflowWrapper.call(receiver, result)).toBe(result);
          expect(getTestSpans()).toHaveLength(0);
          expect(target[method]).toBe(replacement);
          expect(receiver[method](result)).toBe(result);
          expect(getTestSpans()).toHaveLength(1);
          first.disable();
          expect(target[method]).toBe(original);
        } finally {
          first.disable();
          second.disable();
          target[method] = original;
        }
      });
    }
  }

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
