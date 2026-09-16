/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanKind, type Attributes, type HrTime } from '@opentelemetry/api';
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_DESCRIPTION,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_TYPE,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
} from '../semconv';
import type { ContentCaptureMode, ToolInvocationOptions } from '../types';
import { getSpanName, serializeContent } from '../utils';
import type { TelemetryHandler } from '../handler';
import { BaseInvocation } from './base';

/**
 * Build the span attributes that are known when the tool span is started.
 *
 * These are passed to the span at creation time so that they are visible to samplers.
 */
function buildInitialAttributes(
  options: ToolInvocationOptions,
  contentCaptureMode: ContentCaptureMode
): Attributes {
  const attrs: Attributes = {
    [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
    [ATTR_GEN_AI_TOOL_NAME]: options.toolName,
    ...options.attributes,
  };

  if (options.toolDescription) {
    attrs[ATTR_GEN_AI_TOOL_DESCRIPTION] = options.toolDescription;
  }
  if (options.toolCallId) {
    attrs[ATTR_GEN_AI_TOOL_CALL_ID] = options.toolCallId;
  }
  if (options.toolType) {
    attrs[ATTR_GEN_AI_TOOL_TYPE] = options.toolType;
  }
  if (
    options.toolArguments !== undefined &&
    contentCaptureMode === 'span_only'
  ) {
    const formatted = serializeContent(options.toolArguments);
    if (formatted) {
      attrs[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS] = formatted;
    }
  }

  return attrs;
}

/**
 * Manages the lifecycle and telemetry of a Tool execution.
 *
 * @experimental This class is experimental and subject to change.
 */
export class ToolInvocation extends BaseInvocation {
  private readonly _contentCaptureMode: ContentCaptureMode;
  private _toolArguments?: unknown;
  private _result?: unknown;

  /**
   * Start a tool execution invocation, creating and starting the underlying span.
   *
   * Tool executions run in-process, so the span is created with {@link SpanKind.INTERNAL}.
   *
   * @param handler Handler providing the tracer, meter, and completion hooks.
   * @param options Tool details, parent context, and initial attributes.
   */
  constructor(handler: TelemetryHandler, options: ToolInvocationOptions) {
    const contentCaptureMode = handler.getContentCaptureMode();

    super(
      getSpanName(GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL, options.toolName),
      handler,
      {
        kind: SpanKind.INTERNAL,
        attributes: buildInitialAttributes(options, contentCaptureMode),
        context: options.parentContext,
        startTime: options.startTime,
      }
    );

    this._contentCaptureMode = contentCaptureMode;
    this._toolArguments = options.toolArguments;
  }

  public setResult(result: unknown): this {
    this._result = result;
    if (result !== undefined && this._contentCaptureMode === 'span_only') {
      const formatted = serializeContent(result);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_TOOL_CALL_RESULT, formatted);
      }
    }
    return this;
  }

  public getToolArguments(): unknown | undefined {
    return this._toolArguments;
  }

  public getResult(): unknown | undefined {
    return this._result;
  }

  protected override _recordMetrics(
    durationSec: number,
    errorType?: string
  ): void {
    // no-op for now
  }

  /**
   * Emit log-based event `gen_ai.client.inference.operation.details`.
   *
   * NOTE: Currently a no-op placeholder. Will be implemented using LoggerProvider / EventLogger
   * once the Logs & Events API is stable in OpenTelemetry JavaScript.
   */
  protected override _emitContentEvent(_endTime?: HrTime): void {
    // No-op until Logs/Events API is stable in JS.
  }
}
