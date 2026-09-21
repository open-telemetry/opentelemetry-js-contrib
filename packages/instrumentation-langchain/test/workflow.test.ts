/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { instrumentation } from './load-instrumentation';
import { expect } from 'expect';
import {
  context,
  diag,
  DiagLogLevel,
  metrics,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import {
  RunnableLambda,
  RunnableSequence,
  RunnableMap,
} from '@langchain/core/runnables';
import type { Runnable } from '@langchain/core/runnables';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { HumanMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import * as sinon from 'sinon';

function workflow() {
  return RunnableSequence.from([
    RunnableLambda.from((input: string) => input.toUpperCase()),
    RunnableLambda.from((input: string) => `${input}!`),
  ]).withConfig({ runName: 'greeting' });
}

function identity() {
  return RunnableSequence.from([
    RunnableLambda.from((value: unknown) => value),
    RunnableLambda.from((value: unknown) => value),
  ]);
}

function diagnostics() {
  const logger = {
    error: sinon.spy(),
    warn: sinon.spy(),
    info: sinon.spy(),
    debug: sinon.spy(),
    verbose: sinon.spy(),
  };
  diag.setLogger(logger, DiagLogLevel.ALL);
  return logger;
}

describe('LangChain non-streaming workflows', () => {
  before(function () {
    if (Number(process.versions.node.split('.')[0]) < 20) this.skip();
  });
  beforeEach(() => {
    instrumentation.setConfig({ captureMessageContent: false });
    instrumentation.enable();
    resetMemoryExporter();
  });
  afterEach(() => {
    instrumentation.disable();
    instrumentation.setTracerProvider(trace.getTracerProvider());
    instrumentation.setMeterProvider(metrics.getMeterProvider());
    sinon.restore();
    diag.disable();
  });

  it('traces a workflow with official conventions and no content by default', async () => {
    expect(await workflow().invoke('private input')).toBe('PRIVATE INPUT!');
    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('invoke_workflow greeting');
    expect(spans[0].kind).toBe(SpanKind.INTERNAL);
    expect(spans[0].status.code).toBe(SpanStatusCode.UNSET);
    expect(spans[0].attributes).toEqual({
      'gen_ai.operation.name': 'invoke_workflow',
      'gen_ai.workflow.name': 'greeting',
    });
  });

  it('does not instrument standalone lambdas, prompts, parsers or model calls', async () => {
    await RunnableLambda.from((value: string) => value).invoke('test');
    await PromptTemplate.fromTemplate('{text}').invoke({ text: 'test' });
    await new StringOutputParser().invoke('test');
    await new FakeListChatModel({ responses: ['answer'] }).invoke('question');
    expect(getTestSpans()).toHaveLength(0);
  });

  it('does not patch streaming or transform methods', async () => {
    for await (const chunk of await workflow().stream('test'))
      expect(chunk).toBe('TEST!');
    async function* input() {
      yield 'test';
    }
    for await (const chunk of identity().transform(input(), {}))
      expect(chunk).toBe('test');
    expect(getTestSpans()).toHaveLength(0);
  });

  it('does not emit spans when disabled, including a saved wrapper', async () => {
    const chain = identity();
    const invoke = chain.invoke;
    instrumentation.disable();
    expect(await invoke.call(chain, 'test')).toBe('test');
    await workflow().invoke('test');
    expect(getTestSpans()).toHaveLength(0);
  });

  it('respects tracing suppression', async () => {
    await context.with(suppressTracing(context.active()), () =>
      workflow().invoke('test')
    );
    expect(getTestSpans()).toHaveLength(0);
  });

  it('preserves user callbacks and makes the workflow active for child spans', async () => {
    const seen: string[] = [];
    const tracer = trace.getTracer('test');
    const parent = tracer.startSpan('parent');
    const chain = RunnableSequence.from([
      RunnableLambda.from(async (input: string) => {
        await Promise.resolve();
        tracer.startSpan('provider').end();
        return input;
      }),
      RunnableLambda.from((input: string) => input),
    ]);
    await context.with(trace.setSpan(context.active(), parent), () =>
      chain.invoke('test', {
        callbacks: [
          {
            handleChainStart: () => {
              seen.push('start');
            },
          },
        ],
      })
    );
    parent.end();
    const spans = getTestSpans();
    const span = spans.find(
      s => s.attributes['gen_ai.operation.name'] === 'invoke_workflow'
    )!;
    expect(span.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
    expect(
      spans.find(s => s.name === 'provider')!.parentSpanContext?.spanId
    ).toBe(span.spanContext().spanId);
    expect(seen).toHaveLength(3);
    expect(trace.getSpan(context.active())).toBeUndefined();
  });

  it('captures workflow content only when enabled and honors config resets', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    await workflow().invoke('hello', {
      configurable: { thread_id: 'test-thread' },
    });
    const attrs = getTestSpans()[0].attributes;
    expect(attrs['gen_ai.conversation.id']).toBe('test-thread');
    expect(JSON.parse(String(attrs['gen_ai.input.messages']))).toEqual([
      { role: 'user', parts: [{ type: 'text', content: 'hello' }] },
    ]);
    expect(JSON.parse(String(attrs['gen_ai.output.messages']))).toEqual([
      { role: 'assistant', parts: [{ type: 'text', content: 'HELLO!' }] },
    ]);
    instrumentation.setConfig({});
    await workflow().invoke('private');
    expect(
      getTestSpans()[1].attributes['gen_ai.input.messages']
    ).toBeUndefined();
    expect(
      getTestSpans()[1].attributes['gen_ai.output.messages']
    ).toBeUndefined();
  });

  for (const key of ['session_id', 'thread_id', 'conversation_id']) {
    it(`maps ${key} metadata without copying arbitrary metadata`, async () => {
      await workflow().invoke('test', {
        metadata: { [key]: 'session', private: 'not recorded' },
      });
      expect(getTestSpans()[0].attributes['gen_ai.conversation.id']).toBe(
        'session'
      );
      expect(JSON.stringify(getTestSpans()[0].attributes)).not.toContain(
        'not recorded'
      );
    });
  }

  it('preserves configurable and metadata alias precedence and effective withConfig options', async () => {
    const chain = workflow().withConfig({
      configurable: {
        thread_id: 'configured-thread',
        session_id: 'configured-session',
      },
      metadata: {
        session_id: 'metadata-session',
        thread_id: 'metadata-thread',
      },
      runName: 'configured',
    });
    await chain.invoke('input', { runName: 'supplied' });
    expect(getTestSpans()[0].name).toBe('invoke_workflow supplied');
    expect(getTestSpans()[0].attributes['gen_ai.conversation.id']).toBe(
      'configured-thread'
    );
    await workflow().invoke('input', {
      metadata: {
        session_id: 'session',
        thread_id: 'thread',
        conversation_id: 'conversation',
        unrelated: 'private',
      },
    });
    await workflow().invoke('input', { metadata: { unrelated: 'private' } });
    expect(getTestSpans()[1].attributes['gen_ai.conversation.id']).toBe(
      'session'
    );
    expect(
      getTestSpans()[2].attributes['gen_ai.conversation.id']
    ).toBeUndefined();
    expect(
      JSON.stringify(getTestSpans().map(span => span.attributes))
    ).not.toContain('private');
  });

  it('traces parallel workflows without leaking context between invocations', async () => {
    const map = RunnableMap.from({ first: workflow(), second: workflow() });
    expect(await map.invoke('hello')).toEqual({
      first: 'HELLO!',
      second: 'HELLO!',
    });
    const spans = getTestSpans();
    expect(spans).toHaveLength(3);
    const parent = spans.find(
      s => s.attributes['gen_ai.workflow.name'] === 'RunnableMap'
    )!;
    for (const child of spans.filter(s => s !== parent))
      expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
  });

  it('observes the optimized batch without replacing it with invoke calls', async () => {
    const first = RunnableLambda.from((input: string) => input.toUpperCase());
    const chain = RunnableSequence.from([
      first,
      RunnableLambda.from((input: string) => `${input}!`),
    ]);
    const batch = sinon.spy(first, 'batch');
    const options = [{ runName: 'first' }, { runName: 'second' }];
    const batchOptions = { returnExceptions: false };
    expect(await chain.batch(['one', 'two'], options, batchOptions)).toEqual([
      'ONE!',
      'TWO!',
    ]);
    expect(batch.calledOnce).toBe(true);
    expect(batch.firstCall.args[2]).toBe(batchOptions);
    expect(getTestSpans()).toHaveLength(1);
    expect(getTestSpans()[0].attributes['gen_ai.operation.name']).toBe(
      'invoke_workflow'
    );
  });

  it('lets inherited Map.batch delegate to independent invoke boundaries', async () => {
    const map = RunnableMap.from({
      value: RunnableLambda.from((value: string) => value),
    });
    expect(await map.batch(['one', 'two'])).toEqual([
      { value: 'one' },
      { value: 'two' },
    ]);
    expect(getTestSpans()).toHaveLength(2);
    expect(
      getTestSpans().every(span => span.parentSpanContext === undefined)
    ).toBe(true);
  });

  it('preserves the exact Promise subclass, receiver and arguments', async () => {
    class SDKPromise extends Promise<string> {
      marker = 'SDK promise';
    }
    const result = new SDKPromise(resolve => resolve('answer'));
    instrumentation.disable();
    const original = sinon
      .stub(RunnableSequence.prototype, 'invoke')
      .returns(result);
    instrumentation.enable();
    const chain = identity();
    const options = { runName: 'question' };
    expect(chain.invoke('question', options)).toBe(result);
    expect(await result).toBe('answer');
    expect(original.calledOnce).toBe(true);
    expect(original.firstCall.thisValue).toBe(chain);
    expect(original.firstCall.args).toEqual(['question', options]);
    expect(getTestSpans()).toHaveLength(1);
  });

  for (const capture of [false, true]) {
    for (const synchronous of [false, true]) {
      it(`preserves failures without message or stack (capture=${capture}, synchronous=${synchronous})`, async () => {
        instrumentation.setConfig({ captureMessageContent: capture });
        const error = new TypeError('private failure');
        instrumentation.disable();
        const original = sinon
          .stub(RunnableSequence.prototype, 'invoke')
          .callsFake(() => {
            if (synchronous) throw error;
            return Promise.reject(error);
          });
        instrumentation.enable();
        const chain = identity();
        if (synchronous) expect(() => chain.invoke('input')).toThrow(error);
        else await expect(chain.invoke('input')).rejects.toBe(error);
        expect(original.calledOnce).toBe(true);
        const span = getTestSpans()[0];
        expect(span.status).toEqual({ code: SpanStatusCode.ERROR });
        expect(span.attributes['error.type']).toBe('TypeError');
        expect(span.events).toHaveLength(0);
        expect(span.attributes['gen_ai.output.messages']).toBeUndefined();
        expect(JSON.stringify(span.attributes)).not.toContain(
          'private failure'
        );
      });
    }
  }

  for (const error of [
    undefined,
    'private thrown string',
    { message: 'private object' },
  ]) {
    it(`preserves non-Error throws (${typeof error}) with a bounded classification`, async () => {
      instrumentation.disable();
      sinon
        .stub(RunnableSequence.prototype, 'invoke')
        .callsFake(() => Promise.reject(error));
      instrumentation.enable();
      await expect(identity().invoke('input')).rejects.toBe(error);
      const span = getTestSpans()[0];
      expect(span.status).toEqual({ code: SpanStatusCode.ERROR });
      expect(span.attributes['error.type']).toBe('_OTHER');
      expect(span.events).toEqual([]);
    });
  }

  it('contains malicious error getters and never reads the original message or stack', async () => {
    const name = sinon.stub().throws(new Error('private name getter'));
    const sensitive = sinon.stub().throws(new Error('private message getter'));
    const error = new Error();
    Object.defineProperties(error, {
      name: { get: name },
      message: { get: sensitive },
      stack: { get: sensitive },
      code: { get: sensitive },
    });
    const { warn } = diagnostics();
    instrumentation.disable();
    sinon
      .stub(RunnableSequence.prototype, 'invoke')
      .callsFake(() => Promise.reject(error));
    instrumentation.enable();
    await expect(identity().invoke('input')).rejects.toBe(error);
    expect(sensitive.called).toBe(false);
    expect(
      warn.calledWith(
        sinon.match.string,
        'LangChain: could not classify operation failure'
      )
    ).toBe(true);
    expect(getTestSpans()[0].status).toEqual({ code: SpanStatusCode.ERROR });
    expect(getTestSpans()[0].attributes['error.type']).toBe('_OTHER');
  });

  it('preserves AbortSignal cancellation errors', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      workflow().invoke('test', { signal: controller.signal })
    ).rejects.toBe(controller.signal.reason);
    expect(getTestSpans()).toHaveLength(1);
    expect(getTestSpans()[0].attributes['error.type']).toBe('AbortError');
  });

  it('keeps concurrent calls parented to their own active contexts', async () => {
    const tracer = trace.getTracer('test');
    const parents = [tracer.startSpan('first'), tracer.startSpan('second')];
    const chain = workflow();
    await Promise.all(
      parents.map(parent =>
        context.with(trace.setSpan(context.active(), parent), () =>
          chain.invoke('test')
        )
      )
    );
    expect(getTestSpans()).toHaveLength(2);
    expect(
      new Set(getTestSpans().map(s => s.parentSpanContext?.spanId))
    ).toEqual(new Set(parents.map(parent => parent.spanContext().spanId)));
    parents.forEach(parent => parent.end());
  });

  it('keeps enable and disable idempotent and completes in-flight work with its captured config', async () => {
    let release!: (value: string) => void;
    const pending = new Promise<string>(resolve => {
      release = resolve;
    });
    const chain = RunnableSequence.from([
      RunnableLambda.from(() => pending),
      RunnableLambda.from((value: string) => value),
    ]);
    instrumentation.setConfig({ captureMessageContent: true });
    instrumentation.enable();
    instrumentation.enable();
    const result = chain.invoke('hello');
    instrumentation.setConfig({});
    instrumentation.disable();
    instrumentation.disable();
    release('answer');
    expect(await result).toBe('answer');
    expect(getTestSpans()).toHaveLength(1);
    expect(
      getTestSpans()[0].attributes['gen_ai.output.messages']
    ).toBeDefined();
    await workflow().invoke('disabled');
    expect(getTestSpans()).toHaveLength(1);
    instrumentation.enable();
    await workflow().invoke('enabled');
    expect(getTestSpans()).toHaveLength(2);
    expect(
      getTestSpans()[1].attributes['gen_ai.output.messages']
    ).toBeUndefined();
  });

  it('keeps configured stages as siblings', async () => {
    const outer = RunnableSequence.from(
      [
        identity().withConfig({ runName: 'first' }),
        identity().withConfig({ runName: 'second' }),
      ],
      { name: 'outer' }
    );
    expect(await outer.invoke('question')).toBe('question');
    const spans = getTestSpans();
    expect(spans).toHaveLength(3);
    const parent = spans.find(span => span.name === 'invoke_workflow outer')!;
    for (const name of ['first', 'second'])
      expect(
        spans.find(span => span.name === `invoke_workflow ${name}`)
          ?.parentSpanContext?.spanId
      ).toBe(parent.spanContext().spanId);
  });

  it('records recovered recursive workflow failures as distinct spans', async () => {
    const error = new TypeError('inner failure');
    const chain: Runnable<string, string> = RunnableSequence.from([
      RunnableLambda.from(async (value: string) => {
        if (value === 'inner') throw error;
        await expect(chain.invoke('inner', { runName: 'inner' })).rejects.toBe(
          error
        );
        return 'recovered';
      }),
      RunnableLambda.from((value: string) => value),
    ]);
    expect(await chain.invoke('outer', { runName: 'outer' })).toBe('recovered');
    const spans = getTestSpans();
    expect(spans.map(span => span.name)).toEqual([
      'invoke_workflow inner',
      'invoke_workflow outer',
    ]);
    expect(spans[0].status).toEqual({ code: SpanStatusCode.ERROR });
    expect(spans[0].attributes['error.type']).toBe('TypeError');
    expect(spans[0].parentSpanContext?.spanId).toBe(
      spans[1].spanContext().spanId
    );
    expect(spans[1].status.code).toBe(SpanStatusCode.UNSET);
  });

  for (const kind of ['sequence', 'map']) {
    it(`preserves nested ${kind} workflow boundaries`, async () => {
      const tracer = trace.getTracer('test');
      const leaf = RunnableLambda.from((value: string) => {
        tracer.startSpan('application-leaf').end();
        return value.toUpperCase();
      }).withConfig({ runName: 'standalone-lambda' });
      const inner: Runnable<string, unknown> = (
        kind === 'sequence'
          ? RunnableSequence.from([
              RunnableLambda.from((value: string) => value),
              leaf,
            ])
          : RunnableMap.from<string, { answer: string }>({ answer: leaf })
      ).withConfig({ runName: 'inner' });
      const outer = RunnableSequence.from<string, unknown>([
        RunnableLambda.from((value: string) => value),
        inner,
      ]).withConfig({ runName: 'outer' });
      const parent = tracer.startSpan('request');
      expect(
        await context.with(trace.setSpan(context.active(), parent), () =>
          outer.invoke('test')
        )
      ).toEqual(kind === 'sequence' ? 'TEST' : { answer: 'TEST' });
      parent.end();
      const spans = getTestSpans();
      expect(spans.map(span => span.name).sort()).toEqual([
        'application-leaf',
        'invoke_workflow inner',
        'invoke_workflow outer',
        'request',
      ]);
      const outerSpan = spans.find(s => s.name === 'invoke_workflow outer')!;
      const innerSpan = spans.find(s => s.name === 'invoke_workflow inner')!;
      expect(outerSpan.parentSpanContext?.spanId).toBe(
        parent.spanContext().spanId
      );
      expect(innerSpan.parentSpanContext?.spanId).toBe(
        outerSpan.spanContext().spanId
      );
      expect(
        spans.find(s => s.name === 'application-leaf')!.parentSpanContext
          ?.spanId
      ).toBe(innerSpan.spanContext().spanId);
      expect(trace.getSpan(context.active())).toBeUndefined();
    });
  }

  it('excludes internal graph adapters without executing failed calls twice', () => {
    instrumentation.disable();
    const failure = new Error('internal error');
    const original = sinon
      .stub(RunnableSequence.prototype, 'invoke')
      .throws(failure);
    instrumentation.enable();
    const chain = identity();
    chain.omitSequenceTags = true;
    expect(() => chain.invoke('test')).toThrow(failure);
    expect(original.calledOnce).toBe(true);
    expect(getTestSpans()).toHaveLength(0);
  });

  it('preserves legacy function-call content at a public workflow boundary', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    const message = {
      role: 'assistant',
      content: '',
      additional_kwargs: {
        function_call: { name: 'echo', args: '{"text":"answer"}' },
      },
    };
    await identity().invoke([message]);
    for (const key of ['gen_ai.input.messages', 'gen_ai.output.messages']) {
      expect(
        JSON.parse(String(getTestSpans()[0].attributes[key]))[0].parts[1]
      ).toEqual({
        type: 'tool_call',
        name: 'echo',
        arguments: { text: 'answer' },
      });
    }
  });

  for (const capture of [false, true]) {
    it(`captures public prompt values and string message arrays (capture=${capture})`, async () => {
      instrumentation.setConfig({ captureMessageContent: capture });
      const flow = RunnableSequence.from([
        RunnableLambda.from((input: unknown) => input),
        new FakeListChatModel({ responses: ['answer'] }),
      ]);
      for (const [input, expected] of [
        [
          await PromptTemplate.fromTemplate('Question: {question}').invoke({
            question: 'hello',
          }),
          ['Question: hello'],
        ],
        [
          await ChatPromptTemplate.fromMessages([
            ['human', 'Question: {question}'],
          ]).invoke({ question: 'hello' }),
          ['Question: hello'],
        ],
        [
          ['human', 'question'],
          ['human', 'question'],
        ],
        [[['human', 'question']], ['question']],
        [
          ['first', new HumanMessage('second'), ['human', 'third']],
          ['first', 'second', 'third'],
        ],
      ] as const) {
        resetMemoryExporter();
        expect((await flow.invoke(input)).content).toBe('answer');
        const spans = getTestSpans();
        expect(spans).toHaveLength(1);
        expect(spans[0].attributes['gen_ai.input.messages']).toBe(
          capture
            ? JSON.stringify(
                expected.map(content => ({
                  role: 'user',
                  parts: [{ type: 'text', content }],
                }))
              )
            : undefined
        );
        if (!capture)
          expect(spans[0].attributes['gen_ai.output.messages']).toBeUndefined();
      }
    });
  }

  it('contains content extraction failures without changing SDK results', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    const { debug } = diagnostics();
    const failure = new Error('private getter');
    const input = Object.defineProperty({}, 'toChatMessages', {
      get() {
        throw failure;
      },
    });
    const output = Object.defineProperty({}, 'messages', {
      get() {
        throw failure;
      },
    });
    instrumentation.disable();
    const original = sinon
      .stub(RunnableSequence.prototype, 'invoke')
      .resolves(output);
    instrumentation.enable();
    expect(await identity().invoke(input)).toBe(output);
    expect(original.calledOnce).toBe(true);
    expect(getTestSpans()).toHaveLength(1);
    expect(
      getTestSpans()[0].attributes['gen_ai.input.messages']
    ).toBeUndefined();
    expect(
      getTestSpans()[0].attributes['gen_ai.output.messages']
    ).toBeUndefined();
    expect(
      debug.calledWith(
        sinon.match.string,
        'LangChain: failed to normalize messages'
      )
    ).toBe(true);
    expect(JSON.stringify(debug.args)).not.toContain('private getter');
  });

  it('diagnoses boundary metadata failures and preserves the original call', async () => {
    const { warn } = diagnostics();
    const options = Object.defineProperty({}, 'metadata', {
      get() {
        throw new Error('private getter');
      },
    });
    instrumentation.disable();
    const original = sinon
      .stub(RunnableSequence.prototype, 'invoke')
      .resolves('answer');
    instrumentation.enable();
    expect(await identity().invoke('input', options)).toBe('answer');
    expect(original.calledOnce).toBe(true);
    expect(original.firstCall.args[1]).toBe(options);
    expect(getTestSpans()).toHaveLength(0);
    expect(warn.called).toBe(true);
    expect(JSON.stringify(warn.args)).not.toContain('private getter');
  });

  it('honors explicitly supplied and subsequently replaced tracer providers', async () => {
    await workflow().invoke('global');
    const providers: TracerProvider[] = [];
    try {
      for (let index = 0; index < 2; index++) {
        const exporter = new InMemorySpanExporter();
        const provider = new TracerProvider({
          spanProcessors: [new SimpleSpanProcessor({ exporter })],
        });
        providers.push(provider);
        instrumentation.setTracerProvider(provider);
        await workflow().invoke('local');
        expect(exporter.getFinishedSpans()).toHaveLength(1);
        expect(exporter.getFinishedSpans()[0].instrumentationScope.name).toBe(
          instrumentation.instrumentationName
        );
      }
      expect(getTestSpans()).toHaveLength(1);
    } finally {
      instrumentation.setTracerProvider(trace.getTracerProvider());
      await Promise.all(providers.map(provider => provider.shutdown()));
    }
  });

  it('uses instrumentation-owned meters after updates without recording client metrics', async () => {
    for (let index = 0; index < 2; index++) {
      const provider = new MeterProvider();
      const meter = provider.getMeter(`workflow-test-${index}`);
      const record = sinon.spy();
      const create = sinon.stub(meter, 'createHistogram').returns({ record });
      const getMeter = sinon.stub().returns(meter);
      instrumentation.setMeterProvider({ getMeter });
      await workflow().invoke('test');
      expect(create.callCount).toBe(4);
      expect(getMeter.calledOnce).toBe(true);
      expect(record.called).toBe(false);
      await provider.shutdown();
    }
  });

  it('contains span-processor failures without changing results or creating unhandled rejections', async () => {
    const provider = new TracerProvider({
      spanProcessors: [
        {
          onStart() {},
          onEnd() {
            throw new Error('processor failure');
          },
          async forceFlush() {},
          async shutdown() {},
        },
      ],
    });
    instrumentation.setTracerProvider(provider);
    const rejections: unknown[] = [];
    const onRejection = (error: unknown) => rejections.push(error);
    process.on('unhandledRejection', onRejection);
    try {
      expect(await workflow().invoke('ok')).toBe('OK!');
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(rejections).toHaveLength(0);
    } finally {
      process.removeListener('unhandledRejection', onRejection);
      instrumentation.setTracerProvider(trace.getTracerProvider());
      await provider.shutdown();
    }
  });
});
