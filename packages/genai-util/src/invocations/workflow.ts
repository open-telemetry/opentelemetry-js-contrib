/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Attributes, Span } from '@opentelemetry/api';
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_WORKFLOW_NAME,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
} from '../semconv';
import type { WorkflowInvocationOptions } from '../types';
import { BaseInvocation } from './base';

/**
 * Manages the lifecycle and telemetry of a Workflow invocation.
 *
 * @experimental This class is experimental and subject to change.
 */
export class WorkflowInvocation extends BaseInvocation {
  constructor(span: Span, options?: WorkflowInvocationOptions) {
    super(span);
    const attrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
      ...options?.attributes,
    };
    if (options?.workflowName) {
      attrs[ATTR_GEN_AI_WORKFLOW_NAME] = options.workflowName;
    }
    this._span.setAttributes(attrs);
  }
}
