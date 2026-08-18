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
  ATTR_GEN_AI_WORKFLOW_NAME,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
} from '../semconv';
import { getErrorType } from '../utils';

/**
 * Manages the lifecycle and telemetry of a Workflow invocation.
 */
export class WorkflowInvocation {
  private readonly _span: Span;
  private _isEnded = false;

  constructor(
    span: Span,
    options?: {
      workflowName?: string;
      attributes?: Attributes;
    }
  ) {
    this._span = span;
    const attrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
      ...options?.attributes,
    };
    if (options?.workflowName) {
      attrs[ATTR_GEN_AI_WORKFLOW_NAME] = options.workflowName;
    }
    this._span.setAttributes(attrs);
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
