/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { SpanKind, SpanStatusCode, context, trace } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  runTestFixture,
  TestCollector,
} from '@opentelemetry/contrib-test-utils';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_TYPE,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
} from '../src/semconv';
import * as assert from 'assert';

import {
  ClaudeAgentSDKInstrumentation,
  _resetPatchState,
} from '../src/instrumentation';
import type { QueryFunction } from '../src/query-wrapper';

const SYSTEM_MESSAGE = {
  type: 'system',
  subtype: 'init',
  session_id: 'session-123',
  model: 'claude-sonnet-4-5',
};

function resultMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: 'result',
    subtype: 'success',
    duration_ms: 25,
    duration_api_ms: 20,
    is_error: false,
    num_turns: 1,
    stop_reason: 'end_turn',
    total_cost_usd: 0.01,
    usage: {
      input_tokens: 12,
      output_tokens: 8,
      cache_creation_input_tokens: 3,
      cache_read_input_tokens: 4,
    },
    modelUsage: {},
    permission_denials: [],
    result: 'Done',
    uuid: 'result-uuid',
    session_id: 'session-123',
    ...overrides,
  };
}

function createMockQuery({
  messages = [],
  nextError,
  onClose,
  onInterrupt,
}: {
  messages?: unknown[];
  nextError?: Error;
  onClose?: () => void;
  onInterrupt?: () => void;
} = {}): ReturnType<QueryFunction> {
  const generator = (async function* () {
    for (const message of messages) {
      yield message;
    }
    if (nextError) {
      throw nextError;
    }
  })();

  Object.defineProperties(generator, {
    close: {
      configurable: true,
      value: () => onClose?.(),
    },
    interrupt: {
      configurable: true,
      value: async () => onInterrupt?.(),
    },
  });

  return generator as unknown as ReturnType<QueryFunction>;
}

async function consumeQuery(query: ReturnType<QueryFunction>): Promise<void> {
  for await (const message of query) {
    void message;
  }
}

describe('ClaudeAgentSDKInstrumentation', () => {
  let exporter: InMemorySpanExporter;
  let provider: TracerProvider;
  let instrumentation: ClaudeAgentSDKInstrumentation;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new TracerProvider({
      spanProcessors: [new SimpleSpanProcessor({ exporter })],
    });
    instrumentation = new ClaudeAgentSDKInstrumentation();
    instrumentation.setTracerProvider(provider);
  });

  afterEach(async () => {
    instrumentation.disable();
    _resetPatchState();
    exporter.reset();
    await provider.shutdown();
  });

  it('records an invoke_agent span with official GenAI attributes', async () => {
    const original: QueryFunction = () =>
      createMockQuery({
        messages: [SYSTEM_MESSAGE, resultMessage()],
      });
    const module = instrumentation.manuallyInstrument({ query: original });

    await consumeQuery(
      module.query!({
        prompt: 'Inspect the repository.',
        options: {
          model: 'claude-sonnet-4-5',
          systemPrompt: 'Be concise.',
        },
      })
    );

    const spans = exporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];
    assert.strictEqual(span.name, 'invoke_agent Claude Code');
    assert.strictEqual(span.kind, SpanKind.INTERNAL);
    assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
    assert.deepStrictEqual(span.attributes, {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
      [ATTR_GEN_AI_AGENT_NAME]: 'Claude Code',
      [ATTR_GEN_AI_REQUEST_MODEL]: 'claude-sonnet-4-5',
      [ATTR_GEN_AI_CONVERSATION_ID]: 'session-123',
      [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['end_turn'],
      [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 12,
      [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 8,
      [ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: 3,
      [ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 4,
    });
  });

  it('captures message content only when configured', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    const original: QueryFunction = () =>
      createMockQuery({
        messages: [SYSTEM_MESSAGE, resultMessage()],
      });
    const module = instrumentation.manuallyInstrument({ query: original });

    await consumeQuery(
      module.query!({
        prompt: 'Inspect the repository.',
        options: {
          systemPrompt: 'Be concise.',
        },
      })
    );

    const attributes = exporter.getFinishedSpans()[0].attributes;
    assert.deepStrictEqual(
      JSON.parse(attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string),
      [
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Inspect the repository.' }],
        },
      ]
    );
    assert.deepStrictEqual(
      JSON.parse(attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string),
      [
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Done' }],
          finish_reason: 'end_turn',
        },
      ]
    );
    assert.deepStrictEqual(
      JSON.parse(attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] as string),
      [{ type: 'text', content: 'Be concise.' }]
    );
  });

  it('records the selected agent name when supported by the SDK', async () => {
    const original: QueryFunction = () =>
      createMockQuery({ messages: [resultMessage()] });
    const module = instrumentation.manuallyInstrument({ query: original });
    const options = {
      agent: 'reviewer',
      agents: {
        reviewer: {
          description: 'Reviews code changes.',
          prompt: 'Review code.',
          model: 'opus',
        },
      },
    } as unknown as NonNullable<Parameters<QueryFunction>[0]['options']>;

    await consumeQuery(
      module.query!({
        prompt: 'Review this change.',
        options,
      })
    );

    const span = exporter.getFinishedSpans()[0];
    assert.strictEqual(span.name, 'invoke_agent reviewer');
    assert.strictEqual(span.attributes[ATTR_GEN_AI_AGENT_NAME], 'reviewer');
  });

  it('records result errors without changing the returned messages', async () => {
    const errorResult = resultMessage({
      subtype: 'error_max_turns',
      is_error: true,
      errors: ['Maximum turns reached'],
      result: undefined,
    });
    const original: QueryFunction = () =>
      createMockQuery({ messages: [errorResult] });
    const module = instrumentation.manuallyInstrument({ query: original });
    const collected: unknown[] = [];

    for await (const message of module.query!({ prompt: 'Keep going.' })) {
      collected.push(message);
    }

    assert.deepStrictEqual(collected, [errorResult]);
    const span = exporter.getFinishedSpans()[0];
    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(span.status.message, 'Maximum turns reached');
    assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'error_max_turns');
  });

  it('records and rethrows iterator errors', async () => {
    const error = new Error('Connection lost');
    const original: QueryFunction = () => createMockQuery({ nextError: error });
    const module = instrumentation.manuallyInstrument({ query: original });

    await assert.rejects(
      () => consumeQuery(module.query!({ prompt: 'Hello' })),
      thrown => thrown === error
    );

    const span = exporter.getFinishedSpans()[0];
    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'Error');
  });

  it('records and rethrows synchronous query errors', () => {
    const error = new Error('Failed to create query');
    const original: QueryFunction = () => {
      throw error;
    };
    const module = instrumentation.manuallyInstrument({ query: original });

    assert.throws(
      () => module.query!({ prompt: 'Hello' }),
      thrown => thrown === error
    );

    const span = exporter.getFinishedSpans()[0];
    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'Error');
  });

  it('ends the span when iteration stops early', async () => {
    const original: QueryFunction = () =>
      createMockQuery({
        messages: [SYSTEM_MESSAGE, { type: 'assistant' }, resultMessage()],
      });
    const module = instrumentation.manuallyInstrument({ query: original });

    for await (const message of module.query!({ prompt: 'Hello' })) {
      void message;
      break;
    }

    assert.strictEqual(exporter.getFinishedSpans().length, 1);
  });

  it('preserves Query methods and finalizes on close', () => {
    let closeCalled = false;
    let interruptCalled = false;
    const original: QueryFunction = () =>
      createMockQuery({
        onClose: () => {
          closeCalled = true;
        },
        onInterrupt: () => {
          interruptCalled = true;
        },
      });
    const module = instrumentation.manuallyInstrument({ query: original });
    const query = module.query!({ prompt: 'Hello' });

    void query.interrupt();
    const close = Reflect.get(query, 'close') as unknown;
    assert.strictEqual(typeof close, 'function');
    Reflect.apply(close as (...args: unknown[]) => unknown, query, []);

    assert.strictEqual(interruptCalled, true);
    assert.strictEqual(closeCalled, true);
    assert.strictEqual(exporter.getFinishedSpans().length, 1);
  });

  it('creates execute_tool child spans from injected hooks', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    let receivedOptions: Parameters<QueryFunction>[0]['options'];
    const original: QueryFunction = params => {
      receivedOptions = params.options;
      return createMockQuery({ messages: [resultMessage()] });
    };
    const module = instrumentation.manuallyInstrument({ query: original });
    const query = module.query!({ prompt: 'Read package.json' });

    const preToolUse = receivedOptions?.hooks?.PreToolUse?.at(-1)?.hooks[0];
    const postToolUse = receivedOptions?.hooks?.PostToolUse?.at(-1)?.hooks[0];
    assert.ok(preToolUse);
    assert.ok(postToolUse);
    const signal = new AbortController().signal;
    await preToolUse(
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'package.json' },
        tool_use_id: 'tool-1',
        session_id: 'session-123',
        transcript_path: 'transcript.jsonl',
        cwd: process.cwd(),
      },
      'tool-1',
      { signal }
    );
    await postToolUse(
      {
        hook_event_name: 'PostToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'package.json' },
        tool_response: { content: '{}' },
        tool_use_id: 'tool-1',
        session_id: 'session-123',
        transcript_path: 'transcript.jsonl',
        cwd: process.cwd(),
      },
      'tool-1',
      { signal }
    );

    await consumeQuery(query);

    const spans = exporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2);
    const agentSpan = spans.find(
      span =>
        span.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
        GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
    );
    const toolSpan = spans.find(
      span =>
        span.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
        GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL
    );
    assert.ok(agentSpan);
    assert.ok(toolSpan);
    assert.strictEqual(toolSpan.name, 'execute_tool Read');
    assert.strictEqual(toolSpan.kind, SpanKind.INTERNAL);
    assert.strictEqual(toolSpan.attributes[ATTR_GEN_AI_TOOL_NAME], 'Read');
    assert.strictEqual(toolSpan.attributes[ATTR_GEN_AI_TOOL_TYPE], 'extension');
    assert.strictEqual(toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_ID], 'tool-1');
    assert.strictEqual(
      toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS],
      '{"file_path":"package.json"}'
    );
    assert.strictEqual(
      toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
      '{"content":"{}"}'
    );
    assert.strictEqual(
      toolSpan.parentSpanContext?.spanId,
      agentSpan.spanContext().spanId
    );
  });

  it('records failed tool executions', async () => {
    let receivedOptions: Parameters<QueryFunction>[0]['options'];
    const original: QueryFunction = params => {
      receivedOptions = params.options;
      return createMockQuery({ messages: [resultMessage()] });
    };
    const module = instrumentation.manuallyInstrument({ query: original });
    const query = module.query!({ prompt: 'Run a command' });
    const preToolUse = receivedOptions?.hooks?.PreToolUse?.at(-1)?.hooks[0];
    const postToolUseFailure =
      receivedOptions?.hooks?.PostToolUseFailure?.at(-1)?.hooks[0];
    assert.ok(preToolUse);
    assert.ok(postToolUseFailure);
    const signal = new AbortController().signal;

    await preToolUse(
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'exit 1' },
        tool_use_id: 'tool-failure',
        session_id: 'session-123',
        transcript_path: 'transcript.jsonl',
        cwd: process.cwd(),
      },
      'tool-failure',
      { signal }
    );
    await postToolUseFailure(
      {
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        tool_input: { command: 'exit 1' },
        tool_use_id: 'tool-failure',
        error: 'Command failed',
        session_id: 'session-123',
        transcript_path: 'transcript.jsonl',
        cwd: process.cwd(),
      },
      'tool-failure',
      { signal }
    );
    await consumeQuery(query);

    const toolSpan = exporter
      .getFinishedSpans()
      .find(span => span.name === 'execute_tool Bash');
    assert.ok(toolSpan);
    assert.strictEqual(toolSpan.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(
      toolSpan.attributes[ATTR_ERROR_TYPE],
      'tool_execution_error'
    );
  });

  it('preserves user hooks', () => {
    const userHook = async () => ({});
    let receivedOptions: Parameters<QueryFunction>[0]['options'];
    const original: QueryFunction = params => {
      receivedOptions = params.options;
      return createMockQuery();
    };
    const module = instrumentation.manuallyInstrument({ query: original });

    module.query!({
      prompt: 'Hello',
      options: {
        hooks: {
          PreToolUse: [{ hooks: [userHook] }],
        },
      },
    });

    const hooks = receivedOptions?.hooks?.PreToolUse;
    assert.strictEqual(hooks?.length, 2);
    assert.strictEqual(hooks?.[0].hooks[0], userHook);
  });

  it('respects tracing suppression', async () => {
    let receivedOptions: Parameters<QueryFunction>[0]['options'];
    const original: QueryFunction = params => {
      receivedOptions = params.options;
      return createMockQuery({ messages: [resultMessage()] });
    };
    const module = instrumentation.manuallyInstrument({ query: original });
    const suppressedContext = suppressTracing(context.active());
    const query = context.with(suppressedContext, () =>
      module.query!({ prompt: 'Hello', options: {} })
    );

    await consumeQuery(query);

    assert.deepStrictEqual(receivedOptions, {});
    assert.strictEqual(exporter.getFinishedSpans().length, 0);
  });

  it('uses the active span as the agent parent', async () => {
    const tracer = provider.getTracer('test');
    const parent = tracer.startSpan('parent');
    const parentContext = trace.setSpan(context.active(), parent);
    const original: QueryFunction = () =>
      createMockQuery({ messages: [resultMessage()] });
    const module = instrumentation.manuallyInstrument({ query: original });
    const query = context.with(parentContext, () =>
      module.query!({ prompt: 'Hello' })
    );

    await consumeQuery(query);
    parent.end();

    const agentSpan = exporter
      .getFinishedSpans()
      .find(span => span.name === 'invoke_agent Claude Code');
    assert.strictEqual(
      agentSpan?.parentSpanContext?.spanId,
      parent.spanContext().spanId
    );
  });

  it('returns a patched copy for immutable ESM namespaces', async () => {
    const original: QueryFunction = () =>
      createMockQuery({ messages: [resultMessage()] });
    const frozenModule = Object.freeze({ query: original });
    const module = instrumentation.manuallyInstrument(frozenModule);

    assert.notStrictEqual(module, frozenModule);
    assert.strictEqual(frozenModule.query, original);
    assert.notStrictEqual(module.query, original);

    await consumeQuery(module.query!({ prompt: 'Hello' }));
    assert.strictEqual(exporter.getFinishedSpans().length, 1);
  });

  it('patches settable ESM loader namespaces in place', () => {
    const original: QueryFunction = () => createMockQuery();
    const moduleNamespace = { query: original };
    Object.defineProperty(moduleNamespace, Symbol.toStringTag, {
      value: 'Module',
    });
    const module = instrumentation.manuallyInstrument(moduleNamespace);

    assert.strictEqual(module, moduleNamespace);
    assert.notStrictEqual(moduleNamespace.query, original);
    assert.notStrictEqual(module.query, original);
  });

  it('unpatches a settable ESM loader namespace', () => {
    const original: QueryFunction = () => createMockQuery();
    const moduleNamespace = { query: original };
    Object.defineProperty(moduleNamespace, Symbol.toStringTag, {
      value: 'Module',
    });
    const module = instrumentation.manuallyInstrument(moduleNamespace);
    const unpatch = Reflect.get(instrumentation, '_unpatch') as unknown;
    assert.strictEqual(typeof unpatch, 'function');

    Reflect.apply(unpatch as (...args: unknown[]) => unknown, instrumentation, [
      module,
    ]);

    assert.strictEqual(moduleNamespace.query, original);
    assert.strictEqual(module.query, original);
  });

  it('does not fabricate close when the SDK Query omits it', async () => {
    const original: QueryFunction = () => {
      const query = createMockQuery({ messages: [resultMessage()] });
      Reflect.deleteProperty(query, 'close');
      return query;
    };
    const module = instrumentation.manuallyInstrument({ query: original });
    const query = module.query!({ prompt: 'Hello' });

    assert.strictEqual(Reflect.get(query, 'close'), undefined);
    await consumeQuery(query);
  });

  it('keeps the span active when throw is handled by the Query', async () => {
    const original: QueryFunction = () => {
      const query = (async function* () {
        try {
          yield SYSTEM_MESSAGE;
        } catch {
          yield resultMessage();
        }
      })();
      return query as unknown as ReturnType<QueryFunction>;
    };
    const module = instrumentation.manuallyInstrument({ query: original });
    const query = module.query!({ prompt: 'Hello' });

    await query.next();
    const recovered = await query.throw(new Error('recoverable'));

    assert.strictEqual(recovered.done, false);
    assert.strictEqual(exporter.getFinishedSpans().length, 1);
    assert.strictEqual(
      exporter.getFinishedSpans()[0].status.code,
      SpanStatusCode.UNSET
    );
  });

  it('keeps streaming-input queries open across result messages', async () => {
    let receivedOptions: Parameters<QueryFunction>[0]['options'];
    const original: QueryFunction = params => {
      receivedOptions = params.options;
      return createMockQuery({
        messages: [
          resultMessage({
            usage: {
              input_tokens: 7,
              output_tokens: 4,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          }),
          resultMessage({
            usage: {
              input_tokens: 15,
              output_tokens: 9,
              cache_creation_input_tokens: 1,
              cache_read_input_tokens: 2,
            },
          }),
        ],
      });
    };
    const module = instrumentation.manuallyInstrument({ query: original });
    const prompt = {
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'user' as const,
          message: { role: 'user' as const, content: 'Hello' },
          parent_tool_use_id: null,
          session_id: 'session-123',
        };
      },
    } as unknown as Parameters<QueryFunction>[0]['prompt'];
    const query = module.query!({ prompt });

    await query.next();
    assert.strictEqual(exporter.getFinishedSpans().length, 0);

    const preToolUse = receivedOptions?.hooks?.PreToolUse?.at(-1)?.hooks[0];
    const postToolUse = receivedOptions?.hooks?.PostToolUse?.at(-1)?.hooks[0];
    assert.ok(preToolUse);
    assert.ok(postToolUse);
    const signal = new AbortController().signal;
    await preToolUse(
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'package.json' },
        tool_use_id: 'tool-after-result',
        session_id: 'session-123',
        transcript_path: 'transcript.jsonl',
        cwd: process.cwd(),
      },
      'tool-after-result',
      { signal }
    );
    await postToolUse(
      {
        hook_event_name: 'PostToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'package.json' },
        tool_response: { content: '{}' },
        tool_use_id: 'tool-after-result',
        session_id: 'session-123',
        transcript_path: 'transcript.jsonl',
        cwd: process.cwd(),
      },
      'tool-after-result',
      { signal }
    );

    await query.next();
    await query.next();

    const spans = exporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2);
    const agentSpan = spans.find(
      span => span.name === 'invoke_agent Claude Code'
    );
    const toolSpan = spans.find(span => span.name === 'execute_tool Read');
    assert.ok(agentSpan);
    assert.ok(toolSpan);
    assert.strictEqual(
      agentSpan.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS],
      15
    );
    assert.strictEqual(
      toolSpan.parentSpanContext?.spanId,
      agentSpan.spanContext().spanId
    );
  });

  it('does not trace through a retained wrapper after disable', async () => {
    const original: QueryFunction = () =>
      createMockQuery({ messages: [resultMessage()] });
    const module = instrumentation.manuallyInstrument({ query: original });
    instrumentation.disable();

    await consumeQuery(module.query!({ prompt: 'Hello' }));

    assert.strictEqual(exporter.getFinishedSpans().length, 0);
  });
});

describe('ClaudeAgentSDKInstrumentation ESM auto-instrumentation', () => {
  it('patches the real SDK through import-in-the-middle', async function () {
    this.timeout(20000);
    await runTestFixture({
      cwd: __dirname,
      argv: ['fixtures/use-esm-auto.mjs'],
      env: {
        NODE_OPTIONS:
          '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
        NODE_NO_WARNINGS: '1',
      },
      checkCollector: (collector: TestCollector) => {
        assert.strictEqual(collector.spans.length, 0);
      },
    });
  });
});
