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
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
} from '../semconv';
import type { ToolInvocationOptions } from '../types';
import { serializeContent } from '../utils';
import { isSpanContentCaptureEnabled } from '../environment-variables';
import type { TelemetryHandler } from '../handler';
import { BaseInvocation } from './base';

/**
 * Manages the lifecycle and telemetry of a Tool execution.
 *
 * @experimental This class is experimental and subject to change.
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
    const mode = this._handler?.getContentCaptureMode() ?? 'none';

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
      isSpanContentCaptureEnabled(mode)
    ) {
      const formatted = serializeContent(options.toolArguments);
      if (formatted) {
        attrs[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS] = formatted;
      }
    }

    this._span.setAttributes(attrs);
  }

  public setResult(result: unknown): this {
    this._result = result;
    const mode = this._handler?.getContentCaptureMode() ?? 'none';
    if (result !== undefined && isSpanContentCaptureEnabled(mode)) {
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

  /**
   * Emit log-based event `gen_ai.client.inference.operation.details`.
   *
   * NOTE: Currently a no-op placeholder. Will be implemented using LoggerProvider / EventLogger
   * once the Logs & Events API is stable in OpenTelemetry JavaScript.
   */
  protected override _emitContentEvents(_endTime?: HrTime): void {
    // No-op until Logs/Events API is stable in JS.
  }
}
