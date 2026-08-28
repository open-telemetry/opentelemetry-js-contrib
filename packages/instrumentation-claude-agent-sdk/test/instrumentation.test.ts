/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';

import { SpanKind, SpanStatusCode, context, trace } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  runTestFixture,
  TestCollector,
} from '@opentelemetry/contrib-test-utils';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type MetricData,
} from '@opentelemetry/sdk-metrics';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';

import { ClaudeAgentSDKInstrumentation } from '../src';
import type {
  Options,
  HookCallback,
  PostToolUseFailureHookInput,
  PostToolUseHookInput,
  PreToolUseHookInput,
  Query,
  QueryFunction,
  SDKUserMessage,
} from '../src/internal-types';
import {
  ATTR_GEN_AI_AGENT_DESCRIPTION,
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
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  METRIC_GEN_AI_EXECUTE_TOOL_DURATION,
  METRIC_GEN_AI_INVOKE_AGENT_DURATION,
  METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS,
} from '../src/semconv';

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
}: {
  messages?: unknown[];
  nextError?: Error;
  onClose?: () => void;
} = {}): Query {
  const generator = (async function* () {
    for (const message of messages) {
      yield message;
    }
    if (nextError) {
      throw nextError;
    }
  })();
  Object.defineProperty(generator, 'close', {
    configurable: true,
    value: () => onClose?.(),
  });
  return generator as unknown as Query;
}

function createPromptConsumingQuery(
  prompt: string | AsyncIterable<SDKUserMessage>,
  messages: unknown[]
): Query {
  const generator = (async function* () {
    if (typeof prompt !== 'string') {
      for await (const message of prompt) {
        void message;
      }
    }
    for (const message of messages) {
      yield message;
    }
  })();
  Object.defineProperty(generator, 'close', {
    configurable: true,
    value: () => {},
  });
  return generator as unknown as Query;
}

async function consume(query: Query): Promise<void> {
  for await (const message of query) {
    void message;
  }
}

function hookInput<T extends object>(
  input: T
): T & {
  session_id: string;
  transcript_path: string;
  cwd: string;
} {
  return {
    session_id: 'session-123',
    transcript_path: 'transcript.jsonl',
    cwd: process.cwd(),
    ...input,
  };
}

describe('ClaudeAgentSDKInstrumentation', () => {
  let spanExporter: InMemorySpanExporter;
  let tracerProvider: TracerProvider;
  let metricExporter: InMemoryMetricExporter;
  let meterProvider: MeterProvider;
  let instrumentation: ClaudeAgentSDKInstrumentation;

  beforeEach(() => {
    spanExporter = new InMemorySpanExporter();
    tracerProvider = new TracerProvider({
      spanProcessors: [new SimpleSpanProcessor({ exporter: spanExporter })],
    });
    metricExporter = new InMemoryMetricExporter(
      AggregationTemporality.CUMULATIVE
    );
    meterProvider = new MeterProvider({
      readers: [
        new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: 60000,
        }),
      ],
    });
    instrumentation = new ClaudeAgentSDKInstrumentation();
    instrumentation.setTracerProvider(tracerProvider);
    instrumentation.setMeterProvider(meterProvider);
  });

  afterEach(async () => {
    instrumentation.disable();
    spanExporter.reset();
    metricExporter.reset();
    await tracerProvider.shutdown();
    await meterProvider.shutdown();
    delete process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
  });

  function instrument(query: QueryFunction) {
    return instrumentation.manuallyInstrument({ query });
  }

  function getMetric(name: string): MetricData | undefined {
    return metricExporter
      .getMetrics()
      .flatMap(resource => resource.scopeMetrics)
      .flatMap(scope => scope.metrics)
      .find(metric => metric.descriptor.name === name);
  }

  function getHistogramSum(name: string): number | undefined {
    const value = getMetric(name)?.dataPoints[0].value;
    return typeof value === 'number' ? value : value?.sum;
  }

  it('records agent attributes and current usage semantics', async () => {
    const modelUsage = {
      'claude-sonnet-4-5': {
        inputTokens: 20,
        outputTokens: 10,
        cacheReadInputTokens: 6,
        cacheCreationInputTokens: 5,
        webSearchRequests: 0,
        costUSD: 0.01,
        contextWindow: 200000,
        maxOutputTokens: 8192,
      },
    };
    const originalQuery = createMockQuery({
      messages: [SYSTEM_MESSAGE, resultMessage({ modelUsage })],
    });
    const sdk = instrument(() => originalQuery);
    const returnedQuery = sdk.query!({
      prompt: 'Inspect the repository.',
      options: { model: 'claude-sonnet-4-5' },
    });

    assert.strictEqual(returnedQuery, originalQuery);
    await consume(returnedQuery);

    const span = spanExporter.getFinishedSpans()[0];
    assert.strictEqual(span.name, 'invoke_agent Claude Code');
    assert.strictEqual(span.kind, SpanKind.INTERNAL);
    assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
    assert.deepStrictEqual(span.attributes, {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
      [ATTR_GEN_AI_AGENT_NAME]: 'Claude Code',
      [ATTR_GEN_AI_REQUEST_MODEL]: 'claude-sonnet-4-5',
      [ATTR_GEN_AI_CONVERSATION_ID]: 'session-123',
      [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['end_turn'],
      [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 20,
      [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
      [ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 6,
      [ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS]: 5,
    });

    await meterProvider.forceFlush();
    assert.ok(getMetric(METRIC_GEN_AI_INVOKE_AGENT_DURATION));
    const toolCalls = getMetric(METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS);
    assert.strictEqual(
      toolCalls && getHistogramSum(toolCalls.descriptor.name),
      0
    );
  });

  it('uses the active span as parent and runs the SDK in agent context', async () => {
    let observedActiveSpanId: string | undefined;
    const sdk = instrument(() => {
      observedActiveSpanId = trace.getActiveSpan()?.spanContext().spanId;
      return createMockQuery({ messages: [resultMessage()] });
    });
    const tracer = tracerProvider.getTracer('parent-test');
    let parentSpanId = '';

    await tracer.startActiveSpan('parent', async parent => {
      parentSpanId = parent.spanContext().spanId;
      await consume(sdk.query!({ prompt: 'Hello' }));
      parent.end();
    });

    const agent = spanExporter
      .getFinishedSpans()
      .find(span => span.name.startsWith('invoke_agent'));
    assert.strictEqual(agent?.parentSpanContext?.spanId, parentSpanId);
    assert.strictEqual(observedActiveSpanId, agent?.spanContext().spanId);
  });

  it('does not trace when disabled or tracing is suppressed', async () => {
    const sdk = instrument(() =>
      createMockQuery({ messages: [resultMessage()] })
    );
    instrumentation.disable();
    await consume(sdk.query!({ prompt: 'disabled' }));

    const repatched = instrument(() =>
      createMockQuery({ messages: [resultMessage()] })
    );
    await context.with(suppressTracing(context.active()), () =>
      consume(repatched.query!({ prompt: 'suppressed' }))
    );
    assert.strictEqual(spanExporter.getFinishedSpans().length, 0);
  });

  it('captures content only when explicitly enabled', async () => {
    const assistant = {
      type: 'assistant',
      parent_tool_use_id: null,
      uuid: 'assistant-1',
      session_id: 'session-123',
      message: {
        id: 'message-1',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Inspect carefully.' },
          { type: 'text', text: 'Done.', citations: [] },
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'Read',
            input: { file_path: 'package.json' },
          },
        ],
        stop_reason: 'end_turn',
      },
    };
    const withoutContent = instrument(() =>
      createMockQuery({ messages: [assistant, resultMessage()] })
    );
    await consume(
      withoutContent.query!({
        prompt: 'Secret prompt',
        options: { systemPrompt: 'Secret system prompt' },
      })
    );
    const first = spanExporter.getFinishedSpans()[0];
    assert.strictEqual(first.attributes[ATTR_GEN_AI_INPUT_MESSAGES], undefined);
    assert.strictEqual(
      first.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
      undefined
    );

    instrumentation.setConfig({ captureMessageContent: true });
    const withContent = instrument(() =>
      createMockQuery({ messages: [assistant, resultMessage()] })
    );
    await consume(
      withContent.query!({
        prompt: 'Secret prompt',
        options: {
          agent: 'reviewer',
          agents: {
            reviewer: {
              description: 'Reviews changes',
              prompt: 'Review.',
            },
          },
          systemPrompt: ['First instruction', 'Second instruction'],
        },
      })
    );
    const second = spanExporter.getFinishedSpans()[1];
    assert.strictEqual(
      second.attributes[ATTR_GEN_AI_AGENT_DESCRIPTION],
      'Reviews changes'
    );
    assert.deepStrictEqual(
      JSON.parse(second.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string),
      [
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Secret prompt' }],
        },
      ]
    );
    const output = JSON.parse(
      second.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string
    );
    assert.deepStrictEqual(output[0].parts[0], {
      type: 'reasoning',
      content: 'Inspect carefully.',
    });
    assert.deepStrictEqual(
      JSON.parse(second.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] as string),
      [
        { type: 'text', content: 'First instruction' },
        { type: 'text', content: 'Second instruction' },
      ]
    );
  });

  it('maps multimodal, hosted-tool, refusal, and structured output parts', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    const assistant = {
      type: 'assistant',
      parent_tool_use_id: null,
      uuid: 'assistant-parts',
      session_id: 'session-123',
      message: {
        id: 'message-parts',
        role: 'assistant',
        content: [
          { type: 'redacted_thinking', data: 'encrypted-reasoning' },
          {
            type: 'server_tool_use',
            id: 'server-tool-1',
            name: 'web_search',
            input: { query: 'OpenTelemetry' },
          },
          {
            type: 'web_search_tool_result',
            tool_use_id: 'server-tool-1',
            content: [{ title: 'OpenTelemetry' }],
          },
          { type: 'future_provider_part', provider_field: 'preserved' },
        ],
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', reason: 'policy' },
      },
    };
    const user = {
      type: 'user',
      parent_tool_use_id: null,
      uuid: 'user-parts',
      session_id: 'session-123',
      message: {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'url',
              media_type: 'image/png',
              url: 'https://example.test/image.png',
            },
          },
          {
            type: 'document',
            source: {
              type: 'file',
              media_type: 'application/pdf',
              file_id: 'file-1',
            },
          },
          {
            type: 'tool_result',
            tool_use_id: 'tool-1',
            content: 'tool output',
          },
        ],
      },
    };
    const sdk = instrument(() =>
      createMockQuery({
        messages: [
          user,
          assistant,
          resultMessage({
            structured_output: { valid: true },
            stop_reason: 'refusal',
          }),
        ],
      })
    );
    await consume(sdk.query!({ prompt: 'Inspect attachments' }));

    const span = spanExporter.getFinishedSpans()[0];
    const input = JSON.parse(
      span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string
    );
    const output = JSON.parse(
      span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string
    );
    assert.deepStrictEqual(input[1].parts[0], {
      type: 'uri',
      modality: 'image',
      mime_type: 'image/png',
      uri: 'https://example.test/image.png',
    });
    assert.strictEqual(input[1].parts[2].type, 'tool_call_response');
    assert.strictEqual(output[0].parts[0].type, 'reasoning');
    assert.strictEqual(output[0].parts[1].type, 'server_tool_call');
    assert.strictEqual(output[0].parts[2].type, 'server_tool_call_response');
    assert.deepStrictEqual(output[0].parts[3], {
      type: 'future_provider_part',
      provider_field: 'preserved',
    });
    assert.strictEqual(output[0].parts[4].type, 'refusal');
    assert.strictEqual(output[0].parts[5].type, 'structured_output');
  });

  it('captures streaming prompts and replaces partial output with final output', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    const prompt = (async function* (): AsyncGenerator<SDKUserMessage> {
      yield {
        type: 'user',
        parent_tool_use_id: null,
        uuid: '00000000-0000-4000-8000-000000000001',
        session_id: 'session-123',
        message: { role: 'user', content: 'Streaming prompt' },
      };
    })();
    const messages = [
      {
        type: 'stream_event',
        parent_tool_use_id: null,
        uuid: 'partial-1',
        session_id: 'session-123',
        event: {
          type: 'message_start',
          message: {
            id: 'message-1',
            content: [],
            stop_reason: null,
          },
        },
      },
      {
        type: 'stream_event',
        parent_tool_use_id: null,
        uuid: 'partial-2',
        session_id: 'session-123',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
      },
      {
        type: 'stream_event',
        parent_tool_use_id: null,
        uuid: 'partial-3',
        session_id: 'session-123',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Partial' },
        },
      },
      {
        type: 'stream_event',
        parent_tool_use_id: null,
        uuid: 'partial-4',
        session_id: 'session-123',
        event: { type: 'message_stop' },
      },
      {
        type: 'assistant',
        parent_tool_use_id: null,
        uuid: 'assistant-1',
        session_id: 'session-123',
        message: {
          id: 'message-1',
          role: 'assistant',
          content: [{ type: 'text', text: 'Final' }],
          stop_reason: 'end_turn',
        },
      },
      resultMessage(),
    ];
    const sdk = instrument(parameters =>
      createPromptConsumingQuery(parameters.prompt, messages)
    );
    await consume(sdk.query!({ prompt }));

    const span = spanExporter.getFinishedSpans()[0];
    const input = JSON.parse(
      span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string
    );
    const output = JSON.parse(
      span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string
    );
    assert.strictEqual(input[0].parts[0].content, 'Streaming prompt');
    assert.strictEqual(output.length, 1);
    assert.strictEqual(output[0].parts[0].content, 'Final');
  });

  it('records SDK result errors without changing yielded messages', async () => {
    const errorResult = resultMessage({
      subtype: 'error_max_turns',
      is_error: true,
      errors: ['Maximum turns reached'],
      result: undefined,
    });
    const sdk = instrument(() => createMockQuery({ messages: [errorResult] }));
    const received: unknown[] = [];
    for await (const message of sdk.query!({ prompt: 'Loop' })) {
      received.push(message);
    }

    assert.strictEqual(received[0], errorResult);
    const span = spanExporter.getFinishedSpans()[0];
    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'error_max_turns');
  });

  it('records and rethrows synchronous and iterator errors', async () => {
    const synchronousError = new TypeError('cannot start');
    const synchronous = instrument(() => {
      throw synchronousError;
    });
    assert.throws(
      () => synchronous.query!({ prompt: 'Hello' }),
      error => error === synchronousError
    );

    const iteratorError = new RangeError('stream failed');
    const asynchronous = instrument(() =>
      createMockQuery({ nextError: iteratorError })
    );
    await assert.rejects(
      consume(asynchronous.query!({ prompt: 'Hello' })),
      error => error === iteratorError
    );

    const spans = spanExporter.getFinishedSpans();
    assert.deepStrictEqual(
      spans.map(span => span.attributes[ATTR_ERROR_TYPE]),
      ['TypeError', 'RangeError']
    );
    assert.ok(spans.every(span => span.status.code === SpanStatusCode.ERROR));
  });

  it('ends on early return and close while preserving Query methods', async () => {
    let closed = false;
    const sdk = instrument(() =>
      createMockQuery({
        messages: [{ type: 'status' }, resultMessage()],
        onClose: () => {
          closed = true;
        },
      })
    );
    const early = sdk.query!({ prompt: 'Early' });
    await early.next();
    await early.return();
    assert.strictEqual(spanExporter.getFinishedSpans().length, 1);

    const closeable = sdk.query!({ prompt: 'Close' });
    closeable.close();
    assert.strictEqual(closed, true);
    assert.strictEqual(spanExporter.getFinishedSpans().length, 2);
  });

  it('creates tool spans, metrics, and preserves user hooks', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    let observedOptions: Options | undefined;
    let userHookCalled = false;
    const userHook: HookCallback = async () => {
      userHookCalled = true;
      return {};
    };
    const sdk = instrument(parameters => {
      observedOptions = parameters.options;
      return createMockQuery({ messages: [resultMessage()] });
    });
    const query = sdk.query!({
      prompt: 'Read package.json',
      options: {
        hooks: {
          PreToolUse: [{ hooks: [userHook] }],
        },
      },
    });
    const hooks = observedOptions!.hooks!;
    assert.strictEqual(hooks.PreToolUse?.[0].hooks[0], userHook);
    await hooks.PreToolUse?.[0].hooks[0](
      hookInput({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: {},
        tool_use_id: 'user-hook',
      }) as PreToolUseHookInput,
      'user-hook',
      { signal: new AbortController().signal }
    );
    const pre = hooks.PreToolUse!.at(-1)!.hooks[0];
    const post = hooks.PostToolUse!.at(-1)!.hooks[0];
    await pre(
      hookInput({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'package.json' },
        tool_use_id: 'tool-1',
      }) as PreToolUseHookInput,
      'tool-1',
      { signal: new AbortController().signal }
    );
    await post(
      hookInput({
        hook_event_name: 'PostToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'package.json' },
        tool_response: { content: '{}' },
        tool_use_id: 'tool-1',
      }) as PostToolUseHookInput,
      'tool-1',
      { signal: new AbortController().signal }
    );
    await consume(query);

    assert.strictEqual(userHookCalled, true);
    const tool = spanExporter
      .getFinishedSpans()
      .find(span => span.name === 'execute_tool Read')!;
    assert.deepStrictEqual(tool.attributes, {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
      [ATTR_GEN_AI_TOOL_NAME]: 'Read',
      [ATTR_GEN_AI_TOOL_TYPE]: 'extension',
      [ATTR_GEN_AI_TOOL_CALL_ID]: 'tool-1',
      [ATTR_GEN_AI_AGENT_NAME]: 'Claude Code',
      [ATTR_GEN_AI_TOOL_CALL_ARGUMENTS]: '{"file_path":"package.json"}',
      [ATTR_GEN_AI_TOOL_CALL_RESULT]: '{"content":"{}"}',
    });
    assert.strictEqual(
      tool.parentSpanContext?.spanId,
      spanExporter
        .getFinishedSpans()
        .find(span => span.name.startsWith('invoke_agent'))
        ?.spanContext().spanId
    );

    await meterProvider.forceFlush();
    assert.ok(getMetric(METRIC_GEN_AI_EXECUTE_TOOL_DURATION));
    assert.strictEqual(
      getHistogramSum(METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS),
      1
    );
  });

  it('records failed and abandoned tool executions', async () => {
    let observedOptions: Options | undefined;
    const sdk = instrument(parameters => {
      observedOptions = parameters.options;
      return createMockQuery({ messages: [resultMessage()] });
    });
    const query = sdk.query!({ prompt: 'Use tools' });
    const hooks = observedOptions!.hooks!;
    const pre = hooks.PreToolUse!.at(-1)!.hooks[0];
    const fail = hooks.PostToolUseFailure!.at(-1)!.hooks[0];
    for (const id of ['failed', 'abandoned']) {
      await pre(
        hookInput({
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'false' },
          tool_use_id: id,
        }) as PreToolUseHookInput,
        id,
        { signal: new AbortController().signal }
      );
    }
    await fail(
      hookInput({
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        tool_input: { command: 'false' },
        tool_use_id: 'failed',
        error: 'command failed',
      }) as PostToolUseFailureHookInput,
      'failed',
      { signal: new AbortController().signal }
    );
    await consume(query);

    const tools = spanExporter
      .getFinishedSpans()
      .filter(span => span.name === 'execute_tool Bash');
    assert.deepStrictEqual(
      tools.map(span => span.attributes[ATTR_ERROR_TYPE]).sort(),
      ['abandoned', 'tool_execution_error']
    );
    assert.ok(tools.every(span => span.status.code === SpanStatusCode.ERROR));
  });

  it('honors the content-capture environment variable', async () => {
    instrumentation.disable();
    process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = 'true';
    instrumentation = new ClaudeAgentSDKInstrumentation();
    instrumentation.setTracerProvider(tracerProvider);
    instrumentation.setMeterProvider(meterProvider);
    const sdk = instrument(() =>
      createMockQuery({ messages: [resultMessage()] })
    );
    await consume(sdk.query!({ prompt: 'Captured from environment' }));
    assert.ok(
      spanExporter.getFinishedSpans()[0].attributes[ATTR_GEN_AI_INPUT_MESSAGES]
    );
  });

  it('patches immutable namespaces by copy and restores mutable modules', () => {
    const original: QueryFunction = () => createMockQuery();
    const immutable = Object.freeze({ query: original });
    const patched = instrumentation.manuallyInstrument(immutable);
    assert.notStrictEqual(patched, immutable);
    assert.notStrictEqual(patched.query, original);
    assert.strictEqual(immutable.query, original);

    const mutable = { query: original };
    instrumentation.manuallyInstrument(mutable);
    assert.notStrictEqual(mutable.query, original);
    instrumentation.disable();
    assert.strictEqual(mutable.query, original);
    assert.strictEqual(patched.query, original);
  });

  it('auto-instruments the real ESM package through import-in-the-middle', async function () {
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
