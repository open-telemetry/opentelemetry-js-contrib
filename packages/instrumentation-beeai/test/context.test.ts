/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  context,
  diag,
  DiagLogLevel,
  INVALID_SPAN_CONTEXT,
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
  TraceFlags,
} from '@opentelemetry/api';
import {
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import { suppressTracing } from '@opentelemetry/core';
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  InMemorySpanExporter,
  ParentBasedSampler,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { expect } from 'expect';
import * as sinon from 'sinon';
import { z } from 'zod';

import { instrumentation } from './load-instrumentation';
import { BeeAIInstrumentation } from '../src';
import * as bee from 'beeai-framework';
import { DynamicTool, StringToolOutput } from 'beeai-framework/tools/base';
import {
  ATTR_GEN_AI_AGENT_NAME,
  createTestAgent,
  CustomAgent,
  METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS,
  setupBeeAITestSuite,
} from './helpers';

describe('BeeAIInstrumentation - Context and lifecycle', () => {
  const { getMetricReader } = setupBeeAITestSuite();

  describe('Context propagation, suppression, and lifecycle controls', () => {
    it('does not emit spans when instrumentation is disabled', async () => {
      instrumentation.disable();
      const agent = new CustomAgent();
      const result = await agent.run({ prompt: 'Disabled check' });
      expect(result.result.text).toBe('Handled: Disabled check');
      expect(getTestSpans()).toHaveLength(0);
    });

    it('does not emit spans when tracing is suppressed', async () => {
      const agent = new CustomAgent();
      const result = await context.with(suppressTracing(context.active()), () =>
        agent.run({ prompt: 'Suppressed check' })
      );
      expect(result.result.text).toBe('Handled: Suppressed check');
      expect(getTestSpans()).toHaveLength(0);
    });

    it('parents spans to the caller OpenTelemetry context even when an outer span is active', async () => {
      const tracer = trace.getTracer('test-outer');
      const httpSpan = tracer.startSpan('http-request');
      const httpContext = trace.setSpan(context.active(), httpSpan);

      const customSpan = tracer.startSpan(
        'custom-parent',
        undefined,
        httpContext
      );
      const customContext = trace.setSpan(httpContext, customSpan);

      const agent = new CustomAgent();
      await context.with(httpContext, async () => {
        await context.with(customContext, () =>
          agent.run({ prompt: 'Parentage test' })
        );
      });
      customSpan.end();
      httpSpan.end();

      const spans = getTestSpans();
      const agentSpan = spans.find(
        s => s.name === 'invoke_agent CustomAssistant'
      );
      expect(agentSpan).toBeDefined();
      expect(agentSpan!.parentSpanContext?.spanId).toBe(
        customSpan.spanContext().spanId
      );
    });

    it('preserves lazy Run builder chaining (.context, .middleware, .observe) before awaiting', async () => {
      let handlerRuns = 0;
      let middlewareCalled = false;
      let observeCalled = false;

      const tool = new DynamicTool({
        name: 'hook_tool',
        description: 'Tests Run chaining',
        inputSchema: z.object({ value: z.string() }),
        handler: async (input, _options, run) => {
          handlerRuns++;
          const extra = (run.context as { tag?: string }).tag ?? '';
          return new StringToolOutput(`${input.value}:${extra}`);
        },
      });

      const run = tool
        .run({ value: 'ok' })
        .context({ tag: 'ctx-val' })
        .middleware(() => {
          middlewareCalled = true;
        })
        .observe(emitter => {
          emitter.on('start', () => {
            observeCalled = true;
          });
        });

      // Run is lazy: building the chain must not execute the handler or start spans yet.
      expect(handlerRuns).toBe(0);
      expect(getTestSpans()).toHaveLength(0);

      const output = await run;
      expect(handlerRuns).toBe(1);
      expect(middlewareCalled).toBe(true);
      expect(observeCalled).toBe(true);
      expect(output.getTextContent()).toBe('ok:ctx-val');
      expect(getTestSpans()).toHaveLength(1);
    });

    it('preserves cold LazyPromise re-execution and late .context/.observe/.middleware chaining', async () => {
      let handlerRuns = 0;
      const tool = new DynamicTool({
        name: 'reexec_tool',
        description: 'Tests cold LazyPromise re-execution parity',
        inputSchema: z.object({ value: z.string() }),
        handler: async (input, _options, run) => {
          handlerRuns++;
          const tag = (run.context as { tag?: string }).tag ?? 'none';
          return new StringToolOutput(`${input.value}:${tag}:${handlerRuns}`);
        },
      });

      // 1. Re-awaiting the same Run executes the underlying handler each time
      //    (matching native BeeAI LazyPromise semantics) and records a span per run.
      const reusableRun = tool.run({ value: 'poll' });
      const firstOut = await reusableRun;
      const secondOut = await reusableRun;

      expect(firstOut.getTextContent()).toBe('poll:none:1');
      expect(secondOut.getTextContent()).toBe('poll:none:2');
      expect(handlerRuns).toBe(2);
      expect(
        getTestSpans().filter(s => s.name === 'execute_tool reexec_tool')
      ).toHaveLength(2);

      // 2. In BeeAI, `.catch()` triggers an initial LazyPromise execution; chaining
      //    `.context()`, `.middleware()`, and `.observe()` afterwards must still run
      //    fresh on the subsequent `await` rather than returning a stale cached promise.
      resetMemoryExporter();
      handlerRuns = 0;
      let lateMiddlewareRuns = 0;
      let lateObservedStarts = 0;

      const chainedRun = tool.run({ value: 'late' });
      chainedRun.catch(() => {});
      await new Promise(resolve => setImmediate(resolve));

      const lateOut = await chainedRun
        .context({ tag: 'set-late' })
        .middleware(() => {
          lateMiddlewareRuns++;
        })
        .observe(emitter => {
          emitter.on('start', () => {
            lateObservedStarts++;
          });
        });

      expect(lateOut.getTextContent()).toBe('late:set-late:2');
      expect(handlerRuns).toBe(2);
      expect(lateMiddlewareRuns).toBe(1);
      expect(lateObservedStarts).toBe(1);
      expect(
        getTestSpans().filter(s => s.name === 'execute_tool reexec_tool')
      ).toHaveLength(2);
    });

    it('re-parents re-awaited and deferred cold Runs to the active execution context after the creation span ends', async () => {
      const tracer = trace.getTracer('test-cold-run');
      const tool = new DynamicTool({
        name: 'cross_trace_tool',
        description: 'Tests cold Run parentage across traces',
        inputSchema: z.object({ value: z.string() }),
        handler: async input => new StringToolOutput(`ok:${input.value}`),
      });

      // 1. Construct and await inside req1Span, then end req1Span and re-await inside req2Span and ROOT_CONTEXT.
      const req1Span = tracer.startSpan('http-req-1', undefined, ROOT_CONTEXT);
      const req1Ctx = trace.setSpan(ROOT_CONTEXT, req1Span);
      const reusableRun = context.with(req1Ctx, () =>
        tool.run({ value: 'first' })
      );
      await context.with(req1Ctx, async () => await reusableRun);
      req1Span.end();

      const req2Span = tracer.startSpan('http-req-2', undefined, ROOT_CONTEXT);
      const req2Ctx = trace.setSpan(ROOT_CONTEXT, req2Span);
      await context.with(req2Ctx, async () => await reusableRun);
      req2Span.end();

      await context.with(ROOT_CONTEXT, async () => await reusableRun);

      const toolSpans = getTestSpans().filter(
        s => s.name === 'execute_tool cross_trace_tool'
      );
      expect(toolSpans).toHaveLength(3);
      expect(toolSpans[0].spanContext().traceId).toBe(
        req1Span.spanContext().traceId
      );
      expect(toolSpans[0].parentSpanContext?.spanId).toBe(
        req1Span.spanContext().spanId
      );
      expect(toolSpans[1].spanContext().traceId).toBe(
        req2Span.spanContext().traceId
      );
      expect(toolSpans[1].parentSpanContext?.spanId).toBe(
        req2Span.spanContext().spanId
      );
      expect(toolSpans[2].parentSpanContext).toBeUndefined();
      expect(toolSpans[2].spanContext().traceId).not.toBe(
        req1Span.spanContext().traceId
      );
      expect(toolSpans[2].spanContext().traceId).not.toBe(
        req2Span.spanContext().traceId
      );

      // 2. First await deferred until AFTER creation span ends (both under req3 and standalone root).
      resetMemoryExporter();
      const endedSpan = tracer.startSpan(
        'ended-creator',
        undefined,
        ROOT_CONTEXT
      );
      const endedCtx = trace.setSpan(ROOT_CONTEXT, endedSpan);
      const [deferredForReq, deferredForRoot] = context.with(endedCtx, () => [
        tool.run({ value: 'for-req' }),
        tool.run({ value: 'for-root' }),
      ]);
      endedSpan.end();

      const req3Span = tracer.startSpan('http-req-3', undefined, ROOT_CONTEXT);
      const req3Ctx = trace.setSpan(ROOT_CONTEXT, req3Span);
      await context.with(req3Ctx, async () => await deferredForReq);
      req3Span.end();

      await context.with(ROOT_CONTEXT, async () => await deferredForRoot);

      const deferredSpans = getTestSpans().filter(
        s => s.name === 'execute_tool cross_trace_tool'
      );
      expect(deferredSpans).toHaveLength(2);
      expect(deferredSpans[0].spanContext().traceId).toBe(
        req3Span.spanContext().traceId
      );
      expect(deferredSpans[0].parentSpanContext?.spanId).toBe(
        req3Span.spanContext().spanId
      );
      expect(deferredSpans[1].parentSpanContext).toBeUndefined();
      expect(deferredSpans[1].spanContext().traceId).not.toBe(
        endedSpan.spanContext().traceId
      );
    });

    it('prefers active executionContext over an open callerSpan from a different trace', async () => {
      const tracer = trace.getTracer('test-cross-trace');
      const tool = new DynamicTool({
        name: 'handoff_tool',
        description: 'Tests concurrent cross-trace handoff',
        inputSchema: z.object({ value: z.string() }),
        handler: async input => new StringToolOutput(input.value),
      });

      const req1Span = tracer.startSpan('req-1', undefined, ROOT_CONTEXT);
      const req1Ctx = trace.setSpan(ROOT_CONTEXT, req1Span);
      const req2Span = tracer.startSpan('req-2', undefined, ROOT_CONTEXT);
      const req2Ctx = trace.setSpan(ROOT_CONTEXT, req2Span);

      // Construct cold Run in req-1 while both spans remain open, await in req-2.
      const handoffRun = context.with(req1Ctx, () =>
        tool.run({ value: 'concurrent' })
      );
      await context.with(req2Ctx, async () => await handoffRun);
      req1Span.end();
      req2Span.end();

      const toolSpan = getTestSpans().find(
        s => s.name === 'execute_tool handoff_tool'
      );
      expect(toolSpan).toBeDefined();
      expect(toolSpan!.spanContext().traceId).toBe(
        req2Span.spanContext().traceId
      );
      expect(toolSpan!.parentSpanContext?.spanId).toBe(
        req2Span.spanContext().spanId
      );
    });

    it('preserves valid remote parent SpanContext on initial await and clears it on re-execution', async () => {
      const tracer = trace.getTracer('test-remote-parent');
      const tool = new DynamicTool({
        name: 'remote_parent_tool',
        description: 'Tests inbound remote parent context propagation',
        inputSchema: z.object({ value: z.string() }),
        handler: async input => new StringToolOutput(input.value),
      });

      const remoteTraceId = '0123456789abcdef0123456789abcdef';
      const remoteSpanId = '0123456789abcdef';
      const remoteCtx = trace.setSpanContext(ROOT_CONTEXT, {
        traceId: remoteTraceId,
        spanId: remoteSpanId,
        traceFlags: TraceFlags.SAMPLED,
        isRemote: true,
      });

      // Mirror `propagation.extract`: context.with() pops back to ROOT_CONTEXT before await.
      const run = context.with(remoteCtx, () => tool.run({ value: 'inbound' }));
      await run;

      const req2Span = tracer.startSpan('local-req-2', undefined, ROOT_CONTEXT);
      const req2Ctx = trace.setSpan(ROOT_CONTEXT, req2Span);
      await context.with(req2Ctx, async () => await run);
      req2Span.end();

      const toolSpans = getTestSpans().filter(
        s => s.name === 'execute_tool remote_parent_tool'
      );
      expect(toolSpans).toHaveLength(2);
      expect(toolSpans[0].spanContext().traceId).toBe(remoteTraceId);
      expect(toolSpans[0].parentSpanContext?.spanId).toBe(remoteSpanId);
      expect(toolSpans[1].spanContext().traceId).toBe(
        req2Span.spanContext().traceId
      );
      expect(toolSpans[1].parentSpanContext?.spanId).toBe(
        req2Span.spanContext().spanId
      );
    });

    it('preserves a valid unsampled local parent span on initial await and clears it on re-execution', async () => {
      const exporter = new InMemorySpanExporter();
      const parentBasedProvider = new TracerProvider({
        sampler: new ParentBasedSampler({ root: new AlwaysOnSampler() }),
        spanProcessors: [new SimpleSpanProcessor({ exporter })],
      });
      const unsampledProvider = new TracerProvider({
        sampler: new AlwaysOffSampler(),
      });
      const customInst = new BeeAIInstrumentation();
      customInst.setTracerProvider(parentBasedProvider);
      customInst.manuallyInstrument(bee);

      try {
        const observedSpanContexts: Array<{
          traceId: string;
          traceFlags: number;
        }> = [];
        const tool = new DynamicTool({
          name: 'unsampled_parent_tool',
          description: 'Tests unsampled local parent context propagation',
          inputSchema: z.object({ value: z.string() }),
          handler: async input => {
            const activeSpanContext = trace
              .getSpan(context.active())
              ?.spanContext();
            if (activeSpanContext) {
              observedSpanContexts.push({
                traceId: activeSpanContext.traceId,
                traceFlags: activeSpanContext.traceFlags,
              });
            }
            return new StringToolOutput(input.value);
          },
        });

        const unsampledSpan = unsampledProvider
          .getTracer('test-unsampled-parent')
          .startSpan('unsampled-local-parent', undefined, ROOT_CONTEXT);
        expect(unsampledSpan.isRecording()).toBe(false);
        expect(unsampledSpan.spanContext().isRemote).toBeFalsy();
        const unsampledCtx = trace.setSpan(ROOT_CONTEXT, unsampledSpan);

        // 1. Create Run under the unsampled local span and await it outside that context.
        const run = context.with(unsampledCtx, () =>
          tool.run({ value: 'unsampled' })
        );
        await context.with(ROOT_CONTEXT, async () => await run);

        expect(exporter.getFinishedSpans()).toHaveLength(0);
        expect(observedSpanContexts).toHaveLength(1);
        expect(observedSpanContexts[0]).toEqual({
          traceId: unsampledSpan.spanContext().traceId,
          traceFlags: TraceFlags.NONE,
        });

        // 2. Re-awaiting the same cold Run outside the unsampled context starts a fresh sampled trace.
        await context.with(ROOT_CONTEXT, async () => await run);
        const sampledAfterReuse = exporter.getFinishedSpans();
        expect(sampledAfterReuse).toHaveLength(1);
        expect(sampledAfterReuse[0].name).toBe(
          'execute_tool unsampled_parent_tool'
        );
        expect(sampledAfterReuse[0].parentSpanContext).toBeUndefined();
        expect(sampledAfterReuse[0].spanContext().traceId).not.toBe(
          unsampledSpan.spanContext().traceId
        );

        // 3. First-awaiting inside a different sampled trace switches to that active trace.
        exporter.reset();
        const crossTraceRun = context.with(unsampledCtx, () =>
          tool.run({ value: 'cross-trace' })
        );
        const sampledParent = parentBasedProvider
          .getTracer('test-sampled-parent')
          .startSpan('sampled-req', undefined, ROOT_CONTEXT);
        await context.with(
          trace.setSpan(ROOT_CONTEXT, sampledParent),
          async () => await crossTraceRun
        );
        sampledParent.end();

        const crossTraceToolSpans = exporter
          .getFinishedSpans()
          .filter(s => s.name === 'execute_tool unsampled_parent_tool');
        expect(crossTraceToolSpans).toHaveLength(1);
        expect(crossTraceToolSpans[0].spanContext().traceId).toBe(
          sampledParent.spanContext().traceId
        );
        expect(crossTraceToolSpans[0].parentSpanContext?.spanId).toBe(
          sampledParent.spanContext().spanId
        );

        // 4. An invalid local SpanContext is still ignored rather than treated as a parent.
        exporter.reset();
        const invalidCtx = trace.setSpan(
          ROOT_CONTEXT,
          trace.wrapSpanContext(INVALID_SPAN_CONTEXT)
        );
        const invalidParentRun = context.with(invalidCtx, () =>
          tool.run({ value: 'invalid-parent' })
        );
        await context.with(ROOT_CONTEXT, async () => await invalidParentRun);

        const invalidParentSpans = exporter.getFinishedSpans();
        expect(invalidParentSpans).toHaveLength(1);
        expect(invalidParentSpans[0].parentSpanContext).toBeUndefined();
      } finally {
        customInst.disable();
        await parentBasedProvider.shutdown();
        await unsampledProvider.shutdown();
      }
    });

    it('propagates inline suppressTracing to nested calls without permanently muting reusable cold Runs', async () => {
      const tracer = trace.getTracer('test-suppression');
      const innerTool = new DynamicTool({
        name: 'suppressed_tool',
        description: 'Tests suppression lifecycle',
        inputSchema: z.object({ value: z.string() }),
        handler: async input => new StringToolOutput(input.value),
      });

      // 1. Inline suppression of an agent run suppresses both the agent span and its nested tool span.
      const agent = createTestAgent('SuppressedParentAgent', async input => {
        const out = await innerTool.run({ value: input.prompt });
        return out.getTextContent();
      });
      await context.with(suppressTracing(ROOT_CONTEXT), () =>
        agent.run({ prompt: 'quiet' })
      );
      expect(getTestSpans()).toHaveLength(0);

      // 2. Inline suppression inside an active traced request skips only the tool call.
      const reqSpan = tracer.startSpan('active-req', undefined, ROOT_CONTEXT);
      const reqCtx = trace.setSpan(ROOT_CONTEXT, reqSpan);
      await context.with(reqCtx, async () => {
        await context.with(suppressTracing(context.active()), () =>
          innerTool.run({ value: 'muted-in-req' })
        );
      });
      reqSpan.end();
      expect(
        getTestSpans().filter(s => s.name === 'execute_tool suppressed_tool')
      ).toHaveLength(0);

      // 3. Re-awaiting a cold Run originally built under suppressTracing traces normally on reuse.
      resetMemoryExporter();
      const reusableSuppressed = context.with(
        suppressTracing(ROOT_CONTEXT),
        () => innerTool.run({ value: 'reusable' })
      );
      await reusableSuppressed; // initial await in ROOT_CONTEXT is suppressed
      expect(getTestSpans()).toHaveLength(0);

      const req2Span = tracer.startSpan('after-reuse', undefined, ROOT_CONTEXT);
      await context.with(
        trace.setSpan(ROOT_CONTEXT, req2Span),
        async () => await reusableSuppressed
      );
      req2Span.end();
      const reusedSpans = getTestSpans().filter(
        s => s.name === 'execute_tool suppressed_tool'
      );
      expect(reusedSpans).toHaveLength(1);
      expect(reusedSpans[0].spanContext().traceId).toBe(
        req2Span.spanContext().traceId
      );

      // 4. First-awaiting a startup-suppressed cold Run inside an active request span emits telemetry.
      resetMemoryExporter();
      const prebuilt = context.with(suppressTracing(ROOT_CONTEXT), () =>
        innerTool.run({ value: 'startup' })
      );
      const req3Span = tracer.startSpan('traced-req', undefined, ROOT_CONTEXT);
      await context.with(
        trace.setSpan(ROOT_CONTEXT, req3Span),
        async () => await prebuilt
      );
      req3Span.end();
      const prebuiltSpans = getTestSpans().filter(
        s => s.name === 'execute_tool suppressed_tool'
      );
      expect(prebuiltSpans).toHaveLength(1);
      expect(prebuiltSpans[0].spanContext().traceId).toBe(
        req3Span.spanContext().traceId
      );
      expect(prebuiltSpans[0].parentSpanContext?.spanId).toBe(
        req3Span.spanContext().spanId
      );

      // 5. Synchronous throws while tracing is suppressed emit zero error spans.
      resetMemoryExporter();
      const syncAgent = new CustomAgent();
      (syncAgent as unknown as { isRunning: boolean }).isRunning = true;
      expect(() =>
        context.with(suppressTracing(ROOT_CONTEXT), () =>
          syncAgent.run({ prompt: 'concurrent' })
        )
      ).toThrow('Agent is already running!');
      expect(getTestSpans()).toHaveLength(0);
    });

    it('does not leak enclosing agent attribution from stale or finished agent runs on deferred cold Runs', async () => {
      const tracer = trace.getTracer('test-stale-agent');
      const leafTool = new DynamicTool({
        name: 'deferred_leaf_tool',
        description: 'Built inside one agent, executed inside another',
        inputSchema: z.object({ value: z.string() }),
        handler: async input => new StringToolOutput(input.value),
      });

      let deferredToolRun: ReturnType<typeof leafTool.run> | undefined;

      const producerAgent = createTestAgent('ProducerAgent', async input => {
        deferredToolRun = leafTool.run({ value: input.prompt });
        return 'deferred';
      });
      const consumerAgent = createTestAgent('ConsumerAgent', async () => {
        const out = await deferredToolRun!;
        return out.getTextContent();
      });

      await producerAgent.run({ prompt: 'deferred-val' });
      expect(deferredToolRun).toBeDefined();

      // ProducerAgent is finished and its span has ended. Awaiting the Run inside
      // ConsumerAgent must parent and count the tool call under ConsumerAgent.
      await consumerAgent.run({ prompt: 'consume' });

      // Concurrent cross-trace checks: keep OpenProducerAgent open while awaiting
      // its cold tool Runs inside (a) a separate plain span and (b) another active agent.
      let releaseConcurrentProducer!: () => void;
      let concurrentExternalRun: ReturnType<typeof leafTool.run> | undefined;
      let concurrentAgentRun: ReturnType<typeof leafTool.run> | undefined;
      let notifyCreated!: () => void;
      const createdPromise = new Promise<void>(resolve => {
        notifyCreated = resolve;
      });

      const openProducerAgent = createTestAgent(
        'OpenProducerAgent',
        async () => {
          concurrentExternalRun = leafTool.run({ value: 'concurrent-span' });
          concurrentAgentRun = leafTool.run({ value: 'concurrent-agent' });
          notifyCreated();
          await new Promise<void>(resolve => {
            releaseConcurrentProducer = resolve;
          });
          return 'done';
        }
      );
      const concurrentConsumerAgent = createTestAgent(
        'ConcurrentConsumerAgent',
        async () => {
          const out = await concurrentAgentRun!;
          return out.getTextContent();
        }
      );

      const openRunPromise = Promise.resolve(
        openProducerAgent.run({ prompt: 'hold' })
      );
      await createdPromise;
      const externalSpan = tracer.startSpan(
        'external-req',
        undefined,
        ROOT_CONTEXT
      );
      await context.with(
        trace.setSpan(ROOT_CONTEXT, externalSpan),
        async () => await concurrentExternalRun!
      );
      externalSpan.end();
      await context.with(
        ROOT_CONTEXT,
        async () => await concurrentConsumerAgent.run({ prompt: 'take-over' })
      );
      releaseConcurrentProducer();
      await openRunPromise;

      const spans = getTestSpans();
      const producerSpan = spans.find(
        s => s.name === 'invoke_agent ProducerAgent'
      );
      const consumerSpan = spans.find(
        s => s.name === 'invoke_agent ConsumerAgent'
      );
      const concurrentConsumerSpan = spans.find(
        s => s.name === 'invoke_agent ConcurrentConsumerAgent'
      );
      const toolSpans = spans.filter(
        s => s.name === 'execute_tool deferred_leaf_tool'
      );
      expect(producerSpan).toBeDefined();
      expect(consumerSpan).toBeDefined();
      expect(concurrentConsumerSpan).toBeDefined();
      expect(toolSpans).toHaveLength(3);

      // 1st tool span: deferred inside finished ProducerAgent, awaited inside ConsumerAgent
      expect(toolSpans[0].spanContext().traceId).toBe(
        consumerSpan!.spanContext().traceId
      );
      expect(toolSpans[0].parentSpanContext?.spanId).toBe(
        consumerSpan!.spanContext().spanId
      );
      // 2nd tool span: created inside OpenProducerAgent, awaited inside separate trace externalSpan
      expect(toolSpans[1].spanContext().traceId).toBe(
        externalSpan.spanContext().traceId
      );
      expect(toolSpans[1].parentSpanContext?.spanId).toBe(
        externalSpan.spanContext().spanId
      );
      // 3rd tool span: created inside OpenProducerAgent, awaited inside concurrent ConcurrentConsumerAgent
      expect(toolSpans[2].spanContext().traceId).toBe(
        concurrentConsumerSpan!.spanContext().traceId
      );
      expect(toolSpans[2].parentSpanContext?.spanId).toBe(
        concurrentConsumerSpan!.spanContext().spanId
      );

      const { resourceMetrics } = await getMetricReader().collect();
      const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      const toolCalls = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS
      );
      const toolCallCountFor = (name: string): number | undefined => {
        for (const dp of toolCalls?.dataPoints ?? []) {
          if (dp.attributes[ATTR_GEN_AI_AGENT_NAME] === name) {
            return (dp.value as { sum?: number }).sum;
          }
        }
        return undefined;
      };
      expect(toolCallCountFor('ProducerAgent')).toBe(0);
      expect(toolCallCountFor('ConsumerAgent')).toBe(1);
      expect(toolCallCountFor('OpenProducerAgent')).toBe(0);
      expect(toolCallCountFor('ConcurrentConsumerAgent')).toBe(1);
    });

    it('logs a warning and skips patching when manuallyInstrument receives an unsupported version', () => {
      const warnSpy = sinon.spy();
      diag.setLogger(
        {
          error: () => {},
          warn: warnSpy,
          info: () => {},
          debug: () => {},
          verbose: () => {},
        },
        DiagLogLevel.WARN
      );
      const customInst = new BeeAIInstrumentation();
      try {
        customInst.manuallyInstrument({
          ...bee,
          Version: '0.2.0',
        });
        expect(warnSpy.calledOnce).toBe(true);
        expect(warnSpy.firstCall.args.join(' ')).toContain(
          'DependencyConflict'
        );
      } finally {
        customInst.disable();
        diag.disable();
      }
    });

    it('emits telemetry for a pre-constructed lazy Run across disable() and enable() cycles', async () => {
      let runs = 0;
      const tool = new DynamicTool({
        name: 'toggle_cycle_tool',
        description: 'Tests lazy Run owner lookup across disable/enable',
        inputSchema: z.object({ value: z.string() }),
        handler: async input => {
          runs++;
          return new StringToolOutput(`${input.value}:${runs}`);
        },
      });

      // Construct lazy Run while enabled, then toggle disable() -> enable()
      const prebuiltRun = tool.run({ value: 'ping' });

      instrumentation.disable();
      const disabledOut = await prebuiltRun;
      expect(disabledOut.getTextContent()).toBe('ping:1');
      expect(getTestSpans()).toHaveLength(0);

      instrumentation.enable();
      const reenabledOut = await prebuiltRun;
      expect(reenabledOut.getTextContent()).toBe('ping:2');
      const spans = getTestSpans().filter(
        s => s.name === 'execute_tool toggle_cycle_tool'
      );
      expect(spans).toHaveLength(1);
    });

    it('patches subpath modules without BaseAgent and unpatches manual targets on disable()', () => {
      class DummySubpathTool {
        run() {
          return 'original';
        }
      }
      const originalRun = DummySubpathTool.prototype.run;
      const customInst = new BeeAIInstrumentation({ enabled: false });
      customInst.manuallyInstrument({
        Tool: DummySubpathTool as unknown as typeof bee.Tool,
      });
      expect(DummySubpathTool.prototype.run).toBe(originalRun);

      customInst.enable();
      expect(DummySubpathTool.prototype.run).not.toBe(originalRun);

      customInst.disable();
      expect(DummySubpathTool.prototype.run).toBe(originalRun);
    });

    it('records synchronous errors thrown before Run execution starts', () => {
      const agent = new CustomAgent();
      (agent as unknown as { isRunning: boolean }).isRunning = true;

      expect(() => agent.run({ prompt: 'concurrent' })).toThrow(
        'Agent is already running!'
      );

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
      expect(spans[0].attributes[ATTR_ERROR_TYPE]).toBe('AgentError');
    });
  });
});
