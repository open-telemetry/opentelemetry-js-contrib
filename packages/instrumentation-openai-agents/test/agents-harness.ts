/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared setup for the tests that exercise the real @openai/agents SDK.
 *
 * The instrumentation registers itself with the SDK's global trace processor
 * list, so a second instance would replace the first and silently starve it of
 * spans. Every suite that loads the real SDK therefore shares the one
 * instrumentation and exporter defined here.
 */

import { SpanStatusCode } from '@opentelemetry/api';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import {
  InMemorySpanExporter,
  type ReadableSpan,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { OpenAIAgentsInstrumentation } from '../src';

export const exporter = new InMemorySpanExporter();

const provider = new TracerProvider({
  spanProcessors: [new SimpleSpanProcessor({ exporter })],
});

export const instrumentation = new OpenAIAgentsInstrumentation({
  disableOpenAITraceExport: true,
  captureMessageContent: true,
});
instrumentation.setTracerProvider(provider);

/**
 * A tracer standing in for any other instrumentation active during a run, such
 * as `@opentelemetry/instrumentation-openai`. Used to pin how spans from other
 * instrumentations relate to agent spans.
 */
export const unrelatedTracer = provider.getTracer('unrelated-instrumentation');

let agents: typeof import('@openai/agents') | undefined;

/**
 * Loads the real SDK once, so the instrumentation patches it a single time.
 * An existing API key is left alone, which is what lets the cassette suite
 * re-record against the real API.
 */
export function loadAgents(): typeof import('@openai/agents') {
  if (!agents) {
    if (!process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = 'testing';
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    agents = require('@openai/agents');
  }
  return agents as typeof import('@openai/agents');
}

/**
 * Renders the exported spans as an indented tree. Errored spans carry their
 * `error.type`, and a span whose parent was never exported is marked `!orphan`
 * so a leaked parent span is visible rather than silently reparented.
 */
export function spanTree(spans: ReadableSpan[]): string[] {
  const byId = new Map(spans.map(span => [span.spanContext().spanId, span]));
  const childrenOf = new Map<string, ReadableSpan[]>();
  const roots: ReadableSpan[] = [];
  for (const span of spans) {
    const parentId = span.parentSpanContext?.spanId;
    if (parentId && byId.has(parentId)) {
      childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), span]);
    } else {
      roots.push(span);
    }
  }

  // SDK timestamps are millisecond precision, so sibling start times collide
  // routinely. Fall back to export order, which is the order they ended in.
  const endOrder = new Map(spans.map((span, index) => [span, index]));
  const byStartTime = (a: ReadableSpan, b: ReadableSpan) =>
    a.startTime[0] - b.startTime[0] ||
    a.startTime[1] - b.startTime[1] ||
    endOrder.get(a)! - endOrder.get(b)!;

  const lines: string[] = [];
  const walk = (span: ReadableSpan, depth: number) => {
    const parentId = span.parentSpanContext?.spanId;
    const orphan = parentId && !byId.has(parentId) ? '!orphan ' : '';
    const failed =
      span.status.code === SpanStatusCode.ERROR
        ? ` [ERROR ${span.attributes[ATTR_ERROR_TYPE]}]`
        : '';
    lines.push(`${'  '.repeat(depth)}${orphan}${span.name}${failed}`);
    const children = childrenOf.get(span.spanContext().spanId) ?? [];
    for (const child of [...children].sort(byStartTime)) {
      walk(child, depth + 1);
    }
  };
  for (const root of [...roots].sort(byStartTime)) {
    walk(root, 0);
  }
  return lines;
}
