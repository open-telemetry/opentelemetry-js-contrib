/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { hrTimeToSeconds } from '@opentelemetry/core';
import { DataPointType } from '@opentelemetry/sdk-metrics';
import { SamplingDecision, TracerProvider } from '@opentelemetry/sdk-trace';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import * as sinon from 'sinon';
import {
  TelemetryHandler,
  type WorkflowInvocation,
  type WorkflowInvocationOptions,
} from '../../src';
import type { TelemetryHandlerOptions } from '../../src/handler';
import {
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_WORKFLOW_NAME,
  GEN_AI_SCHEMA_URL,
  METRIC_GEN_AI_INVOKE_WORKFLOW_DURATION,
} from '../../src/semconv';
import type { InputMessages, OutputMessages } from '../../src/types';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from '../helpers/test-setup';

describe('WorkflowInvocation', () => {
  let ctx: TestTelemetryContext;

  beforeEach(() => {
    ctx = createTestTelemetryContext();
  });

  afterEach(async () => {
    sinon.restore();
    await ctx.shutdown();
  });

  function createHandler(
    options: Partial<TelemetryHandlerOptions> = {}
  ): TelemetryHandler {
    return new TelemetryHandler({
      instrumentationName: 'test-workflow-instrumentation',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
      contentCaptureMode: 'none',
      ...options,
    });
  }

  async function durationMetric() {
    const { resourceMetrics, errors } = await ctx.metricReader.collect();
    assert.deepStrictEqual(errors, []);
    const scopeMetrics = resourceMetrics.scopeMetrics;
    assert.strictEqual(scopeMetrics.length, 1);
    assert.deepStrictEqual(scopeMetrics[0].scope, {
      name: 'test-workflow-instrumentation',
      version: '1.2.3',
      schemaUrl: GEN_AI_SCHEMA_URL,
    });
    const metrics = scopeMetrics[0].metrics;
    assert.strictEqual(metrics.length, 1, 'no inference or tool metrics');
    const metric = metrics[0];
    assert.strictEqual(
      metric.descriptor.name,
      METRIC_GEN_AI_INVOKE_WORKFLOW_DURATION
    );
    assert.strictEqual(metric.descriptor.unit, 's');
    assert.ok(metric.dataPointType === DataPointType.HISTOGRAM);
    return metric;
  }

  it('creates one INTERNAL span and matching workflow duration through the public API', async () => {
    const options: WorkflowInvocationOptions = {
      workflowName: 'support',
      conversationId: 'conversation-1',
      startTime: [100, 100_000_000],
    };
    const invocation: WorkflowInvocation =
      createHandler().startWorkflow(options);
    assert.strictEqual(invocation.isEnded(), false);
    assert.strictEqual(ctx.memoryExporter.getFinishedSpans().length, 0);
    invocation.stop([102, 600_000_000]);

    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(span.name, 'invoke_workflow support');
    assert.strictEqual(span.kind, SpanKind.INTERNAL);
    assert.deepStrictEqual(span.status, { code: SpanStatusCode.UNSET });
    assert.deepStrictEqual(span.events, []);
    assert.deepStrictEqual(span.attributes, {
      [ATTR_GEN_AI_OPERATION_NAME]: 'invoke_workflow',
      [ATTR_GEN_AI_WORKFLOW_NAME]: 'support',
      [ATTR_GEN_AI_CONVERSATION_ID]: 'conversation-1',
    });
    assert.deepStrictEqual(span.instrumentationScope, {
      name: 'test-workflow-instrumentation',
      version: '1.2.3',
      schemaUrl: GEN_AI_SCHEMA_URL,
    });
    const metric = await durationMetric();
    assert.strictEqual(metric.dataPoints.length, 1);
    const point = metric.dataPoints[0];
    assert.deepStrictEqual(point.attributes, {
      [ATTR_GEN_AI_WORKFLOW_NAME]: 'support',
    });
    assert.strictEqual(point.value.count, 1);
    assert.strictEqual(point.value.sum, 2.5);
    assert.strictEqual(point.value.sum, hrTimeToSeconds(span.duration));
    assert.deepStrictEqual(
      point.value.buckets.boundaries,
      [1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600, 7200]
    );
  });

  for (const workflowName of [undefined, '', ' \t ']) {
    it(`omits unavailable workflow names (${JSON.stringify(workflowName)})`, async () => {
      createHandler().startWorkflow({ workflowName }).stop();
      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.name, 'invoke_workflow');
      assert.deepStrictEqual(span.attributes, {
        [ATTR_GEN_AI_OPERATION_NAME]: 'invoke_workflow',
      });
      const metric = await durationMetric();
      assert.deepStrictEqual(metric.dataPoints[0].attributes, {});
    });
  }

  it('keeps resolved span names, attributes and metric names consistent', async () => {
    createHandler()
      .startWorkflow({
        workflowName: ' support ',
        attributes: {
          [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
          [ATTR_GEN_AI_WORKFLOW_NAME]: 'wrong',
          'custom.span.attribute': 'retained',
        },
      })
      .stop();
    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(span.name, 'invoke_workflow support');
    assert.deepStrictEqual(span.attributes, {
      [ATTR_GEN_AI_OPERATION_NAME]: 'invoke_workflow',
      [ATTR_GEN_AI_WORKFLOW_NAME]: 'support',
      'custom.span.attribute': 'retained',
    });
    const metric = await durationMetric();
    assert.deepStrictEqual(metric.dataPoints[0].attributes, {
      [ATTR_GEN_AI_WORKFLOW_NAME]: 'support',
    });
  });

  it('makes workflow identity available to the sampler without message content', async () => {
    const seen: Attributes[] = [];
    const provider = new TracerProvider({
      sampler: {
        shouldSample(_context, _traceId, _name, _kind, attributes) {
          seen.push(attributes);
          return { decision: SamplingDecision.NOT_RECORD };
        },
        toString: () => 'WorkflowSampler',
      },
    });
    try {
      createHandler({
        tracerProvider: provider,
        contentCaptureMode: 'span_only',
      })
        .startWorkflow({
          workflowName: 'support',
          conversationId: 'conversation-1',
          inputMessages: [
            { role: 'user', parts: [{ type: 'text', content: 'private' }] },
          ],
        })
        .stop();
      assert.deepStrictEqual(seen, [
        {
          [ATTR_GEN_AI_OPERATION_NAME]: 'invoke_workflow',
          [ATTR_GEN_AI_WORKFLOW_NAME]: 'support',
          [ATTR_GEN_AI_CONVERSATION_ID]: 'conversation-1',
        },
      ]);
      assert.strictEqual(ctx.memoryExporter.getFinishedSpans().length, 0);
      assert.strictEqual((await durationMetric()).dataPoints[0].value.count, 1);
    } finally {
      await provider.shutdown();
    }
  });

  it('records the final SDK snapshots without appending earlier messages or mutating arrays', async () => {
    const initial: InputMessages = [
      { role: 'user', parts: [{ type: 'text', content: 'question' }] },
    ];
    const finalInput: InputMessages = [
      {
        role: 'tool',
        parts: [
          { type: 'tool_call_response', id: 'call-1', response: 'answer' },
        ],
      },
    ];
    const output: OutputMessages = [
      {
        role: 'assistant',
        parts: [
          {
            type: 'blob',
            modality: 'image',
            content: new Uint8Array([1, 2, 3]),
          },
        ],
      },
    ];
    const invocation = createHandler({
      contentCaptureMode: 'span_only',
    }).startWorkflow({ inputMessages: initial });
    invocation.setOutputMessages([
      { role: 'assistant', parts: [{ type: 'text', content: 'outdated' }] },
    ]);
    assert.strictEqual(invocation.setInputMessages(finalInput), invocation);
    assert.strictEqual(invocation.setOutputMessages(output), invocation);
    invocation.setInputMessages(finalInput).setOutputMessages(output);
    assert.strictEqual(initial.length, 1);
    assert.strictEqual(finalInput.length, 1);
    assert.strictEqual(output.length, 1);
    initial.length = 0;
    finalInput.length = 0;
    output.length = 0;
    invocation.stop();
    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.deepStrictEqual(
      JSON.parse(String(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES])),
      [
        {
          role: 'tool',
          parts: [
            { type: 'tool_call_response', id: 'call-1', response: 'answer' },
          ],
        },
      ]
    );
    assert.deepStrictEqual(
      JSON.parse(String(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES])),
      [
        {
          role: 'assistant',
          parts: [{ type: 'blob', modality: 'image', content: 'AQID' }],
        },
      ]
    );
    assert.deepStrictEqual(
      (await durationMetric()).dataPoints[0].attributes,
      {}
    );
    assert.deepStrictEqual(span.events, []);
  });

  it('does not serialize disabled content or snapshots supplied after completion', () => {
    const serialize = sinon.spy(() => {
      throw new Error('private content');
    });
    const messages: InputMessages = [
      {
        role: 'user',
        parts: [{ type: 'text', content: 'private' }],
        toJSON: serialize,
      },
    ];
    const invocation = createHandler().startWorkflow({
      inputMessages: messages,
    });
    invocation.setInputMessages(messages).setOutputMessages(messages).stop();
    const ended = createHandler({
      contentCaptureMode: 'span_only',
    }).startWorkflow({});
    ended.stop();
    ended.setInputMessages(messages).setOutputMessages(messages).stop();
    assert.strictEqual(serialize.callCount, 0);
    for (const span of ctx.memoryExporter.getFinishedSpans()) {
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES],
        undefined
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
        undefined
      );
    }
  });

  it('omits empty messages without reporting a serialization failure', () => {
    const handler = createHandler({ contentCaptureMode: 'span_only' });
    const warn = sinon.spy(handler.getDiag(), 'warn');
    handler.startWorkflow({ inputMessages: [] }).setOutputMessages([]).stop();
    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES], undefined);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES], undefined);
    assert.strictEqual(warn.callCount, 0);
  });

  it('clears earlier snapshots when the final SDK data is absent', () => {
    const messages: InputMessages = [
      { role: 'user', parts: [{ type: 'text', content: 'outdated' }] },
    ];
    const invocation = createHandler({
      contentCaptureMode: 'span_only',
    }).startWorkflow({ inputMessages: messages });
    invocation.setOutputMessages(messages);
    invocation.setInputMessages(undefined).setOutputMessages(undefined).stop();
    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES], undefined);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES], undefined);
  });

  it('serializes SDK snapshots only when the run completes', () => {
    const input = {
      role: 'user',
      parts: [{ type: 'text', content: 'question' }],
    };
    const output = {
      role: 'assistant',
      parts: [{ type: 'text', content: 'answer' }],
    };
    const serializeInput = sinon.spy(() => input);
    const serializeOutput = sinon.spy(() => output);
    const invocation = createHandler({
      contentCaptureMode: 'span_only',
    }).startWorkflow({
      inputMessages: [{ ...input, toJSON: serializeInput }],
    });
    invocation.setOutputMessages([{ ...output, toJSON: serializeOutput }]);
    assert.strictEqual(serializeInput.callCount, 0);
    assert.strictEqual(serializeOutput.callCount, 0);
    assert.strictEqual(ctx.memoryExporter.getFinishedSpans().length, 0);
    invocation.stop();
    invocation.stop();
    assert.strictEqual(serializeInput.callCount, 1);
    assert.strictEqual(serializeOutput.callCount, 1);
    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_INPUT_MESSAGES],
      JSON.stringify([input])
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
      JSON.stringify([output])
    );
  });

  for (const side of ['input', 'output'] as const) {
    it(`diagnoses unserializable ${side} messages without leaking content or losing duration`, async () => {
      const handler = createHandler({ contentCaptureMode: 'span_only' });
      const warn = sinon.spy(handler.getDiag(), 'warn');
      const invalid: InputMessages = [{ role: 'user', parts: [] }];
      invalid[0].circular = invalid;
      const valid: OutputMessages = [
        { role: 'assistant', parts: [{ type: 'text', content: 'valid' }] },
      ];
      const invocation = handler.startWorkflow({
        inputMessages: side === 'input' ? invalid : valid,
      });
      invocation.setOutputMessages(side === 'output' ? invalid : valid);
      assert.doesNotThrow(() => invocation.stop());
      const [span] = ctx.memoryExporter.getFinishedSpans();
      const invalidAttribute =
        side === 'input'
          ? ATTR_GEN_AI_INPUT_MESSAGES
          : ATTR_GEN_AI_OUTPUT_MESSAGES;
      const validAttribute =
        side === 'input'
          ? ATTR_GEN_AI_OUTPUT_MESSAGES
          : ATTR_GEN_AI_INPUT_MESSAGES;
      assert.strictEqual(span.attributes[invalidAttribute], undefined);
      assert.strictEqual(
        span.attributes[validAttribute],
        JSON.stringify(valid)
      );
      assert.deepStrictEqual(warn.args, [
        [`Could not serialize workflow ${side} messages`],
      ]);
      assert.strictEqual((await durationMetric()).dataPoints[0].value.count, 1);
    });
  }

  it('retains SDK-provided output on failure without exposing exception details', async () => {
    const messages: OutputMessages = [
      { role: 'assistant', parts: [{ type: 'text', content: 'partial' }] },
    ];
    const invocation = createHandler({
      contentCaptureMode: 'span_only',
    }).startWorkflow({
      workflowName: 'support',
      inputMessages: [
        { role: 'user', parts: [{ type: 'text', content: 'question' }] },
      ],
      startTime: [100, 0],
    });
    invocation.setOutputMessages(messages);
    invocation.fail(
      { exception: new RangeError('private failure details') },
      [103, 0]
    );
    invocation.stop();
    invocation.fail({ errorType: 'AnotherError' });
    assert.strictEqual(invocation.isEnded(), true);
    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const [span] = spans;
    assert.deepStrictEqual(span.status, { code: SpanStatusCode.ERROR });
    assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'RangeError');
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
      JSON.stringify(messages)
    );
    assert.deepStrictEqual(span.events, []);
    assert.ok(
      !JSON.stringify(span.attributes).includes('private failure details')
    );
    const point = (await durationMetric()).dataPoints[0];
    assert.deepStrictEqual(point.attributes, {
      [ATTR_GEN_AI_WORKFLOW_NAME]: 'support',
      [ATTR_ERROR_TYPE]: 'RangeError',
    });
    assert.strictEqual(point.value.count, 1);
    assert.strictEqual(point.value.sum, hrTimeToSeconds(span.duration));
  });

  it('preserves metric attribute overrides without copying span-only content', async () => {
    const invocation = createHandler().startWorkflow({
      workflowName: 'support',
      conversationId: 'conversation-1',
      attributes: { 'custom.span': 'span-only' },
      metricAttributes: {
        [ATTR_GEN_AI_WORKFLOW_NAME]: 'grouped-workflow',
        [ATTR_ERROR_TYPE]: 'wrong',
      },
    });
    invocation.setMetricAttribute('custom.metric', 'metric-only');
    invocation.fail({ errorType: 'timeout' });
    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(span.attributes[ATTR_GEN_AI_WORKFLOW_NAME], 'support');
    assert.strictEqual(span.attributes['custom.metric'], undefined);
    assert.deepStrictEqual((await durationMetric()).dataPoints[0].attributes, {
      [ATTR_GEN_AI_WORKFLOW_NAME]: 'grouped-workflow',
      [ATTR_ERROR_TYPE]: 'timeout',
      'custom.metric': 'metric-only',
    });
  });

  it('parents nested workflows and tools explicitly without a context manager', () => {
    const handler = createHandler();
    const outer = handler.startWorkflow({ workflowName: 'outer' });
    const inner = handler.startWorkflow({
      workflowName: 'inner',
      parentContext: outer.getContext(),
    });
    handler
      .startTool({ toolName: 'lookup', parentContext: inner.getContext() })
      .stop();
    inner.stop();
    outer.stop();
    const [tool, child, parent] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(
      child.parentSpanContext?.spanId,
      parent.spanContext().spanId
    );
    assert.strictEqual(
      tool.parentSpanContext?.spanId,
      child.spanContext().spanId
    );
    assert.strictEqual(
      tool.spanContext().traceId,
      parent.spanContext().traceId
    );
  });

  it('preserves asynchronous active context and passes it to duration recording', async () => {
    context.setGlobalContextManager(
      new AsyncLocalStorageContextManager().enable()
    );
    try {
      const handler = createHandler();
      const record = sinon.spy(handler, 'recordInvokeWorkflowDuration');
      const outer = handler.startWorkflow({ workflowName: 'outer' });
      const before = context.active();
      const result = await outer.withContext(async () => {
        await Promise.resolve();
        assert.strictEqual(
          trace.getSpan(context.active()),
          trace.getSpan(outer.getContext())
        );
        handler.startWorkflow({ workflowName: 'inner' }).stop();
        return 42;
      });
      assert.strictEqual(result, 42);
      assert.strictEqual(context.active(), before);
      assert.strictEqual(outer.isEnded(), false);
      outer.stop();
      const [child, parent] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(
        child.parentSpanContext?.spanId,
        parent.spanContext().spanId
      );
      assert.strictEqual(record.lastCall.args[2], outer.getContext());
    } finally {
      context.disable();
    }
  });
});
