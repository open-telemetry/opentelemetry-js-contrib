/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Attributes, HrTime, Span } from '@opentelemetry/api';
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_DESCRIPTION,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_TYPE,
  EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
} from '../semconv';
import type { ToolInvocationOptions } from '../types';
import { serializeContent } from '../utils';
import { isEventContentCaptureEnabled } from '../environment-variables';
import type { TelemetryHandler } from '../handler';
import { BaseInvocation } from './base';

/**
 * Manages the lifecycle and telemetry of a Tool execution.
 */
export class ToolInvocation extends BaseInvocation {
  private _toolArguments?: unknown;
  private _result?: unknown;

  constructor(
    span: Span,
    options: ToolInvocationOptions,
    handler?: TelemetryHandler
  ) {
    super(span, handler);
    this._toolArguments = options.toolArguments;

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
    if (options.toolArguments !== undefined) {
      attrs[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS] = serializeContent(
        options.toolArguments
      );
    }

    this._span.setAttributes(attrs);
  }

  public setResult(result: unknown): this {
    this._result = result;
    if (result !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_TOOL_CALL_RESULT,
        serializeContent(result)
      );
    }
    return this;
  }

  protected override _emitContentEvents(endTime?: HrTime): void {
    const mode = this._handler?.getContentCaptureMode() ?? 'none';
    if (!isEventContentCaptureEnabled(mode)) {
      return;
    }

    const eventAttrs: Attributes = {};
    if (this._toolArguments !== undefined) {
      const formatted = serializeContent(this._toolArguments);
      if (formatted) {
        eventAttrs[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS] = formatted;
      }
    }
    if (this._result !== undefined) {
      const formatted = serializeContent(this._result);
      if (formatted) {
        eventAttrs[ATTR_GEN_AI_TOOL_CALL_RESULT] = formatted;
      }
    }

    if (Object.keys(eventAttrs).length > 0) {
      this._span.addEvent(
        EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS,
        eventAttrs,
        endTime
      );
    }
  }
}
