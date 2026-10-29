/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanKind, type Attributes } from '@opentelemetry/api';
import type { TelemetryHandler } from '../handler';
import {
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_WORKFLOW_NAME,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
} from '../semconv';
import type {
  InputMessages,
  OutputMessages,
  WorkflowInvocationOptions,
} from '../types';
import { formatInputMessages, formatOutputMessages } from '../utils';
import { BaseInvocation } from './base';

/**
 * Owns one in-process workflow span and its duration metric.
 *
 * Callers supply the SDK's normalized input/output snapshots and complete the
 * invocation with `stop()` or `fail()`. This class does not aggregate messages
 * or observe SDK streams.
 *
 * @experimental
 */
export class WorkflowInvocation extends BaseInvocation {
  private readonly _workflowName?: string;
  private _inputMessages?: InputMessages;
  private _outputMessages?: OutputMessages;

  constructor(handler: TelemetryHandler, options: WorkflowInvocationOptions) {
    const operationName = GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW;
    const workflowName = options.workflowName?.trim() || undefined;
    const attributes: Attributes = {
      ...options.attributes,
      [ATTR_GEN_AI_OPERATION_NAME]: operationName,
      [ATTR_GEN_AI_WORKFLOW_NAME]: workflowName,
    };
    if (options.conversationId) {
      attributes[ATTR_GEN_AI_CONVERSATION_ID] = options.conversationId;
    }

    super(
      workflowName ? `${operationName} ${workflowName}` : operationName,
      handler,
      {
        kind: SpanKind.INTERNAL,
        attributes,
        metricAttributes: options.metricAttributes,
        context: options.parentContext,
        startTime: options.startTime,
      }
    );
    this._workflowName = workflowName;
    this.setInputMessages(options.inputMessages);
  }

  /** Replace the SDK's input snapshot, which may be updated at completion. */
  public setInputMessages(messages: InputMessages | undefined): this {
    if (!this._isEnded && this.shouldCaptureContent()) {
      this._inputMessages = messages ? [...messages] : undefined;
    }
    return this;
  }

  /**
   * Replace the SDK's output snapshot. Record only outputs the SDK reports,
   * including any it provides on failure; do not reconstruct stream output.
   */
  public setOutputMessages(messages: OutputMessages | undefined): this {
    if (!this._isEnded && this.shouldCaptureContent()) {
      this._outputMessages = messages ? [...messages] : undefined;
    }
    return this;
  }

  protected override _getSemconvMetricAttributes(): Attributes {
    return this._workflowName
      ? { [ATTR_GEN_AI_WORKFLOW_NAME]: this._workflowName }
      : {};
  }

  protected override _recordMetrics(
    durationSec: number,
    errorType?: string
  ): void {
    this._handler.recordInvokeWorkflowDuration(
      durationSec,
      this._getMetricAttributes(errorType),
      this._context
    );
  }

  protected override _onInvocationEnd(): void {
    if (!this.shouldCaptureContent()) return;

    const inputMessages = formatInputMessages(this._inputMessages);
    if (inputMessages) {
      this._span.setAttribute(ATTR_GEN_AI_INPUT_MESSAGES, inputMessages);
    } else if (this._inputMessages?.length) {
      this._handler
        .getDiag()
        .warn('Could not serialize workflow input messages');
    }

    const outputMessages = formatOutputMessages(this._outputMessages);
    if (outputMessages) {
      this._span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, outputMessages);
    } else if (this._outputMessages?.length) {
      this._handler
        .getDiag()
        .warn('Could not serialize workflow output messages');
    }
    this._inputMessages = undefined;
    this._outputMessages = undefined;
  }
}
