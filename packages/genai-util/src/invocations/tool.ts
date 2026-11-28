/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanKind, type Attributes, type HrTime } from '@opentelemetry/api';
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
  ATTR_GEN_AI_TRANSFER_MODE,
  ATTR_GEN_AI_TRANSFER_TARGET_NAME,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
} from '../semconv';
import type {
  ContentCaptureMode,
  ToolInvocationOptions,
  ToolType,
  TransferMode,
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
  if (options.transferMode) {
    attrs[ATTR_GEN_AI_TRANSFER_MODE] = options.transferMode;
  }
  if (options.transferTargetName) {
    attrs[ATTR_GEN_AI_TRANSFER_TARGET_NAME] = options.transferTargetName;
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
  private readonly _operationName: string;
  private _toolName: string;
  private readonly _toolType?: ToolType;
  private readonly _agentName?: string;
  private _arguments?: unknown;
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
      metricAttributes: options.metricAttributes,
      context: options.parentContext,
      startTime: options.startTime,
    });

    this._contentCaptureMode = contentCaptureMode;
    this._operationName = operationName;
    this._toolName = options.toolName;
    this._toolType = options.toolType;
    this._agentName = options.agentName;
  }

  /**
   * Update the tool name (`gen_ai.tool.name`), span name, and duration metric
   * dimension when the final tool name is only known after span start.
   */
  public setToolName(name: string): this {
    this._toolName = name;
    this._span.setAttribute(ATTR_GEN_AI_TOOL_NAME, name);
    this._span.updateName(`${this._operationName} ${name}`);
    return this;
  }

  /**
   * Set the unique identifier of the tool call (`gen_ai.tool.call.id`).
   */
  public setToolCallId(id: string): this {
    this._span.setAttribute(ATTR_GEN_AI_TOOL_CALL_ID, id);
    return this;
  }

  /**
   * Set the description of the tool (`gen_ai.tool.description`).
   */
  public setToolDescription(description: string): this {
    this._span.setAttribute(ATTR_GEN_AI_TOOL_DESCRIPTION, description);
    return this;
  }

  /**
   * Record the arguments passed to the tool call (`gen_ai.tool.call.arguments`).
   *
   * Useful for callback-based SDKs where tool arguments are populated after the
   * tool span has already started. Finalized onto the span when the invocation ends
   * if `contentCaptureMode` is `'span_only'`.
   */
  public setArguments(args: unknown): this {
    this._arguments = args;
    return this;
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

  /**
   * Mark this tool invocation as an agent transfer (`gen_ai.transfer.mode` and
   * optionally `gen_ai.transfer.target.name`).
   */
  public setTransfer(mode: TransferMode, targetName?: string): this {
    this._span.setAttribute(ATTR_GEN_AI_TRANSFER_MODE, mode);
    if (targetName) {
      this._span.setAttribute(ATTR_GEN_AI_TRANSFER_TARGET_NAME, targetName);
    }
    return this;
  }

  /**
   * Semantic convention dimensions for `gen_ai.execute_tool.duration`:
   * `gen_ai.tool.name` (required) and `gen_ai.agent.name` / `gen_ai.tool.type` when
   * known. Caller-supplied metric attributes override these; see
   * {@link BaseInvocation._getMetricAttributes}.
   */
  protected override _getSemconvMetricAttributes(): Attributes {
    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_TOOL_NAME]: this._toolName,
    };
    if (this._agentName) {
      metricAttrs[ATTR_GEN_AI_AGENT_NAME] = this._agentName;
    }
    if (this._toolType) {
      metricAttrs[ATTR_GEN_AI_TOOL_TYPE] = this._toolType;
    }
    return metricAttrs;
  }

  /**
   * Record `gen_ai.execute_tool.duration`, with `error.type` on failure.
   */
  protected override _recordMetrics(
    durationSec: number,
    errorType?: string
  ): void {
    const metricAttrs = this._getMetricAttributes(errorType);

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
   * Hook for subclasses to emit invocation specific telemetry.
   */
  protected override _onInvocationEnd(
    _endTime: HrTime,
    _errorType?: string
  ): void {
    if (
      this._arguments !== undefined &&
      this._contentCaptureMode === 'span_only'
    ) {
      const formatted = serializeContent(this._arguments);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_TOOL_CALL_ARGUMENTS, formatted);
      }
    }

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
