/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Attributes, Span } from '@opentelemetry/api';
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
import { BaseInvocation } from './base';

/**
 * Manages the lifecycle and telemetry of a Tool execution.
 */
export class ToolInvocation extends BaseInvocation {
  constructor(span: Span, options: ToolInvocationOptions) {
    super(span);
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
    if (result !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_TOOL_CALL_RESULT,
        serializeContent(result)
      );
    }
    return this;
  }
}
