/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Attributes, SpanKind } from '@opentelemetry/api';
import { AttributeNames } from '../enums';
import { AwsSdkInstrumentationConfig, NormalizedRequest } from '../types';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';

export class KinesisServiceExtension implements ServiceExtension {
  requestPreSpanHook(
    request: NormalizedRequest,
    _config: AwsSdkInstrumentationConfig
  ): RequestMetadata {
    const streamName = request.commandInput?.StreamName;
    const spanKind: SpanKind = SpanKind.CLIENT;
    const spanAttributes: Attributes = {};

    if (streamName) {
      spanAttributes[AttributeNames.AWS_KINESIS_STREAM_NAME] = streamName;
    }

    const isIncoming = false;

    return {
      isIncoming,
      spanAttributes,
      spanKind,
    };
  }
}
