/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SpanKind,
  type Attributes,
  type Context,
  type TimeInput,
} from '@opentelemetry/api';
import {
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_WORKFLOW_NAME,
  BaseInvocation,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
  TelemetryHandler,
} from '@opentelemetry/genai-util';
import { messages } from './content';

export class LangChainWorkflowInvocation extends BaseInvocation {
  constructor(
    handler: TelemetryHandler,
    attributes: Attributes,
    context: Context
  ) {
    const name = attributes[ATTR_GEN_AI_WORKFLOW_NAME];
    super(
      name
        ? `${GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW} ${name}`
        : GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
      handler,
      { kind: SpanKind.INTERNAL, attributes, context }
    );
  }

  complete(output: unknown): void {
    if (this.isEnded()) return;
    try {
      if (this.shouldCaptureContent()) {
        const content = messages(output, this._handler.getDiag(), 'assistant');
        if (content !== undefined)
          this.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, content);
      }
    } catch {
      this._handler
        .getDiag()
        .warn('LangChain: could not extract operation telemetry');
    } finally {
      this.stop();
    }
  }

  override fail(error: unknown, endTime?: TimeInput): void {
    if (this.isEnded()) return;
    let name = '_OTHER';
    try {
      const errorName = error instanceof Error ? error.name : undefined;
      if (typeof errorName === 'string' && errorName) {
        name = errorName;
      }
    } catch {
      this._handler
        .getDiag()
        .warn('LangChain: could not classify operation failure');
    }
    // BaseInvocation records the supplied Error's message. Pass only the source
    // instrumentation's error name, never the application's message or stack.
    const sanitized = new Error();
    sanitized.name = name;
    sanitized.stack = undefined;
    Object.defineProperty(sanitized, 'message', { value: undefined });
    super.fail(sanitized, endTime);
  }

  protected _recordMetrics(): void {
    // This migration is span-only; INTERNAL workflows must not emit client metrics.
  }
}
