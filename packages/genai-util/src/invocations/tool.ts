/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanKind, type Attributes, type HrTime } from '@opentelemetry/api';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_DESCRIPTION,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_TYPE,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
} from '../semconv';
import type {
  ContentCaptureMode,
  ToolInvocationOptions,
  ToolType,
} from '../types';
import { serializeContent } from '../utils';
import type { TelemetryHandler } from '../handler';
import { BaseInvocation } from './base';

/**
 * Build the span attributes that are known when the tool span is started.
 *
 * These are passed to the span at creation time so that they are visible to samplers.
 * The semantic convention attributes are applied after the caller's custom attributes so
 * that a caller cannot accidentally overwrite the required `gen_ai.operation.name` and
 * `gen_ai.tool.name`; use `operationName` to override the operation name deliberately.
 *
 * `gen_ai.agent.name` is resolved here rather than after the span starts because the
 * semantic conventions list it, alongside `gen_ai.operation.name`, as an attribute that
 * SHOULD be available to samplers at span creation time.
 */
function buildInitialAttributes(
  options: ToolInvocationOptions,
  operationName: string,
  contentCaptureMode: ContentCaptureMode
): Attributes {
  const attrs: Attributes = {
    ...options.attributes,
    [ATTR_GEN_AI_OPERATION_NAME]: operationName,
    [ATTR_GEN_AI_TOOL_NAME]: options.toolName,
  };

  if (options.agentName) {
    attrs[ATTR_GEN_AI_AGENT_NAME] = options.agentName;
  }
  if (options.conversationId) {
    attrs[ATTR_GEN_AI_CONVERSATION_ID] = options.conversationId;
  }
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
  private readonly _toolName: string;
  private readonly _toolType?: ToolType;
  private readonly _agentName?: string;
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
    const operationName =
      options.operationName ?? GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL;

    // Span name follows `{gen_ai.operation.name} {gen_ai.tool.name}`, so it is built from
    // the resolved operation name rather than the `execute_tool` constant: overriding the
    // operation name must not leave the span name disagreeing with the attribute.
    super(`${operationName} ${options.toolName}`, handler, {
      kind: SpanKind.INTERNAL,
      attributes: buildInitialAttributes(
        options,
        operationName,
        contentCaptureMode
      ),
      context: options.parentContext,
      startTime: options.startTime,
    });

    this._contentCaptureMode = contentCaptureMode;
    this._toolName = options.toolName;
    this._toolType = options.toolType;
    this._agentName = options.agentName;
    this._toolArguments = options.toolArguments;
  }

  /**
   * Record the value returned by the tool call (`gen_ai.tool.call.result`).
   *
   * Per the semantic conventions this attribute describes the result of a *successful*
   * execution, so it should not be called on the error path; report failures with
   * {@link fail} instead.
   */
  public setResult(result: unknown): this {
    this._result = result;
    return this;
  }

  public getToolArguments(): unknown | undefined {
    return this._toolArguments;
  }

  public getResult(): unknown | undefined {
    return this._result;
  }

  /**
   * Record `gen_ai.execute_tool.duration`.
   *
   * Dimensions follow the metric definition: `gen_ai.tool.name` (required),
   * `error.type` (on failure), and `gen_ai.agent.name` / `gen_ai.tool.type` when known.
   * Caller-supplied metric attributes are applied first so that the semantic convention
   * dimensions always win.
   */
  protected override _recordMetrics(
    durationSec: number,
    errorType?: string
  ): void {
    const metricAttrs: Attributes = {
      ...this._metricAttributes,
      [ATTR_GEN_AI_TOOL_NAME]: this._toolName,
    };
    if (this._agentName) {
      metricAttrs[ATTR_GEN_AI_AGENT_NAME] = this._agentName;
    }
    if (this._toolType) {
      metricAttrs[ATTR_GEN_AI_TOOL_TYPE] = this._toolType;
    }
    if (errorType) {
      metricAttrs[ATTR_ERROR_TYPE] = errorType;
    }

    // The invocation context is passed explicitly: metrics are recorded while the
    // invocation's context may no longer be active, and exemplars must still point
    // at the invocation span.
    this._handler.recordExecuteToolDuration(
      durationSec,
      metricAttrs,
      this._context
    );
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

  /**
   * Hook for subclasses to emit invocation specific telemetry.
   */
  protected override _onInvocationEnd(
    _endTime: HrTime,
    _errorType?: string
  ): void {
    // Set the result if it is set and invocation completed successfully
    if (_errorType === undefined) {
      if (
        this._result !== undefined &&
        this._contentCaptureMode === 'span_only'
      ) {
        const formatted = serializeContent(this._result);
        if (formatted) {
          this._span.setAttribute(ATTR_GEN_AI_TOOL_CALL_RESULT, formatted);
        }
      }
    }
  }
}
