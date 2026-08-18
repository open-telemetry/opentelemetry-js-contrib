/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SpanStatusCode,
  type Attributes,
  type HrTime,
  type Span,
} from '@opentelemetry/api';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
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
import { getErrorType } from '../utils';

/**
 * Manages the lifecycle and telemetry of a Tool execution.
 */
export class ToolInvocation {
  private readonly _span: Span;
  private _isEnded = false;

  constructor(
    span: Span,
    options: {
      toolName: string;
      toolDescription?: string;
      toolCallId?: string;
      toolType?: string;
      toolArguments?: unknown;
      attributes?: Attributes;
    }
  ) {
    this._span = span;
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
      attrs[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS] =
        typeof options.toolArguments === 'string'
          ? options.toolArguments
          : JSON.stringify(options.toolArguments);
    }

    this._span.setAttributes(attrs);
  }

  public setResult(result: unknown): this {
    if (result !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_TOOL_CALL_RESULT,
        typeof result === 'string' ? result : JSON.stringify(result)
      );
    }
    return this;
  }

  public setAttribute(key: string, value: any): this {
    this._span.setAttribute(key, value);
    return this;
  }

  public setAttributes(attributes: Attributes): this {
    this._span.setAttributes(attributes);
    return this;
  }

  public stop(endTime?: HrTime | number): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    this._span.setStatus({ code: SpanStatusCode.OK });
    this._span.end(endTime);
  }

  public fail(
    error: Error | string | unknown,
    endTime?: HrTime | number
  ): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    const errorType = getErrorType(error);
    this._span.setAttribute(ATTR_ERROR_TYPE, errorType);
    if (error instanceof Error) {
      this._span.recordException(error);
    }
    this._span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    this._span.end(endTime);
  }

  public getSpan(): Span {
    return this._span;
  }
}
