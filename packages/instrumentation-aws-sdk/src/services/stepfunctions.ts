/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Attributes, SpanKind } from '@opentelemetry/api';
import {
  ATTR_AWS_STEP_FUNCTIONS_ACTIVITY_ARN,
  ATTR_AWS_STEP_FUNCTIONS_STATE_MACHINE_ARN,
} from '../semconv';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import { NormalizedRequest, AwsSdkInstrumentationConfig } from '../types';

export class StepFunctionsServiceExtension implements ServiceExtension {
  requestPreSpanHook(
    request: NormalizedRequest,
    _config: AwsSdkInstrumentationConfig
  ): RequestMetadata {
    const stateMachineArn = request.commandInput?.stateMachineArn;
    const activityArn = request.commandInput?.activityArn;
    const spanKind: SpanKind = SpanKind.CLIENT;
    const spanAttributes: Attributes = {};

    if (stateMachineArn) {
      spanAttributes[ATTR_AWS_STEP_FUNCTIONS_STATE_MACHINE_ARN] =
        stateMachineArn;
    }

    if (activityArn) {
      spanAttributes[ATTR_AWS_STEP_FUNCTIONS_ACTIVITY_ARN] = activityArn;
    }

    return {
      isIncoming: false,
      spanAttributes,
      spanKind,
    };
  }
}
