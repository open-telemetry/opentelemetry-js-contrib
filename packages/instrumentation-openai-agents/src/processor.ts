/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  context,
  SpanKind,
  SpanStatusCode,
  trace as otelTrace,
} from '@opentelemetry/api';
import type {
  Attributes,
  Context,
  DiagLogger,
  Span,
  TimeInput,
  Tracer,
} from '@opentelemetry/api';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import type {
  OpenAIAgentsSpan,
  OpenAIAgentsTrace,
  OpenAIAgentsTracingProcessor as OpenAIAgentsTracingProcessorApi,
} from './internal-types';
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_TYPE,
  ATTR_GEN_AI_WORKFLOW_NAME,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
  GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
} from './semconv';
import type { OpenAIAgentsInstrumentationConfig } from './types';

interface SpanRecord {
  context: Context;
  span?: Span;
}

export class OpenAIAgentsTracingProcessor
  implements OpenAIAgentsTracingProcessorApi
{
  private _enabled = true;
  private _captureMessageContent = false;
  private _spanRecords = new WeakMap<object, SpanRecord>();
  private _spanContexts = new Map<string, Context>();
  private _traceRecords = new WeakMap<object, SpanRecord>();
  private _traceContexts = new Map<string, Context>();
  private readonly _openSpans = new Set<Span>();

  constructor(
    private readonly _getTracer: () => Tracer,
    config: OpenAIAgentsInstrumentationConfig,
    private readonly _diag: DiagLogger
  ) {
    this.setConfig(config);
  }

  setConfig(config: OpenAIAgentsInstrumentationConfig): void {
    this._captureMessageContent = !!config.captureMessageContent;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (!enabled) {
      void this.shutdown();
    }
  }

  onTraceStart(trace: OpenAIAgentsTrace): Promise<void> {
    this._safely('starting trace span', () => {
      if (!this._enabled || this._traceRecords.has(trace)) {
        return;
      }

      const name = trace.name?.trim();
      const parentContext = context.active();
      const attributes: Attributes = {
        [ATTR_GEN_AI_OPERATION_NAME]:
          GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
      };
      if (name) {
        attributes[ATTR_GEN_AI_WORKFLOW_NAME] = name;
      }
      const span = this._getTracer().startSpan(
        name
          ? `${GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW} ${name}`
          : GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
        {
          kind: SpanKind.INTERNAL,
          attributes,
        },
        parentContext
      );
      const spanContext = otelTrace.setSpan(parentContext, span);
      this._traceRecords.set(trace, { context: spanContext, span });
      this._traceContexts.set(trace.traceId, spanContext);
      this._openSpans.add(span);
    });
    return Promise.resolve();
  }

  onTraceEnd(trace: OpenAIAgentsTrace): Promise<void> {
    this._safely('ending trace span', () => {
      const record = this._traceRecords.get(trace);
      if (!record) {
        return;
      }
      record.span?.end();
      if (record.span) {
        this._openSpans.delete(record.span);
      }
      this._traceRecords.delete(trace);
      this._traceContexts.delete(trace.traceId);
    });
    return Promise.resolve();
  }

  onSpanStart(span: OpenAIAgentsSpan): Promise<void> {
    this._safely('starting span', () => {
      if (!this._enabled || this._spanRecords.has(span)) {
        return;
      }

      const parentContext = this._parentContext(span);
      const otelSpan = this._startMappedSpan(span, parentContext);
      const spanContext = otelSpan
        ? otelTrace.setSpan(parentContext, otelSpan)
        : parentContext;

      this._spanRecords.set(span, { context: spanContext, span: otelSpan });
      this._spanContexts.set(span.spanId, spanContext);
      if (otelSpan) {
        this._openSpans.add(otelSpan);
      }
    });
    return Promise.resolve();
  }

  onSpanEnd(span: OpenAIAgentsSpan): Promise<void> {
    this._safely('ending span', () => {
      const record = this._spanRecords.get(span);
      if (!record) {
        return;
      }

      if (record.span) {
        if (span.spanData.type === 'function' && this._captureMessageContent) {
          if (span.spanData.input !== undefined) {
            record.span.setAttribute(
              ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
              this._stringValue(span.spanData.input)
            );
          }
          if (span.spanData.output !== undefined) {
            record.span.setAttribute(
              ATTR_GEN_AI_TOOL_CALL_RESULT,
              this._stringValue(span.spanData.output)
            );
          }
        }
        this._setError(record.span, span);
        record.span.end(this._asTimeInput(span.endedAt));
        this._openSpans.delete(record.span);
      }

      this._spanRecords.delete(span);
      this._spanContexts.delete(span.spanId);
    });
    return Promise.resolve();
  }

  shutdown(_timeout?: number): Promise<void> {
    for (const span of [...this._openSpans].reverse()) {
      span.end();
    }
    this._openSpans.clear();
    this._spanRecords = new WeakMap<object, SpanRecord>();
    this._spanContexts.clear();
    this._traceRecords = new WeakMap<object, SpanRecord>();
    this._traceContexts.clear();
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  private _startMappedSpan(
    span: OpenAIAgentsSpan,
    parentContext: Context
  ): Span | undefined {
    const data = span.spanData;
    const startTime = this._asTimeInput(span.startedAt);

    if (data.type === 'agent') {
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      const attributes: Attributes = {
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
      };
      if (name) {
        attributes[ATTR_GEN_AI_AGENT_NAME] = name;
      }
      return this._getTracer().startSpan(
        name
          ? `${GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT} ${name}`
          : GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
        {
          kind: SpanKind.INTERNAL,
          startTime,
          attributes,
        },
        parentContext
      );
    }

    if (data.type === 'function') {
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      const attributes: Attributes = {
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
        [ATTR_GEN_AI_TOOL_TYPE]: GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
      };
      if (name) {
        attributes[ATTR_GEN_AI_TOOL_NAME] = name;
      }
      const toolSpan = this._getTracer().startSpan(
        name
          ? `${GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL} ${name}`
          : GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
        {
          kind: SpanKind.INTERNAL,
          startTime,
          attributes,
        },
        parentContext
      );
      return toolSpan;
    }

    return undefined;
  }

  private _parentContext(span: OpenAIAgentsSpan): Context {
    if (span.parentId) {
      const parent = this._spanContexts.get(span.parentId);
      if (parent) {
        return parent;
      }
    }
    return this._traceContexts.get(span.traceId) || context.active();
  }

  private _setError(otelSpan: Span, span: OpenAIAgentsSpan): void {
    if (!span.error) {
      return;
    }
    otelSpan.recordException(span.error.message);
    otelSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: span.error.message,
    });
    const errorType = span.error.data?.type;
    otelSpan.setAttribute(
      ATTR_ERROR_TYPE,
      typeof errorType === 'string' ? errorType : '_OTHER'
    );
  }

  private _asTimeInput(
    value: string | null | undefined
  ): TimeInput | undefined {
    if (!value) {
      return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private _stringValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private _safely(description: string, callback: () => void): void {
    try {
      callback();
    } catch (error) {
      // The Agents SDK does not await processor callbacks when spans start, so
      // processor failures must be contained here rather than rejected.
      this._diag.error(
        `OpenAI Agents instrumentation failed while ${description}`,
        error
      );
    }
  }
}
