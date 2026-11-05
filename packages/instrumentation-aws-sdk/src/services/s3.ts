/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Attributes, SpanKind } from '@opentelemetry/api';
import { AttributeNames } from '../enums';
import { ATTR_AWS_S3_KEY } from '../semconv';
import { AwsSdkInstrumentationConfig, NormalizedRequest } from '../types';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';

export class S3ServiceExtension implements ServiceExtension {
  requestPreSpanHook(
    request: NormalizedRequest,
    _config: AwsSdkInstrumentationConfig
  ): RequestMetadata {
    const bucketName = request.commandInput?.Bucket;
    const objectKey = request.commandInput?.Key;
    const spanKind: SpanKind = SpanKind.CLIENT;
    const spanAttributes: Attributes = {};

    if (bucketName) {
      spanAttributes[AttributeNames.AWS_S3_BUCKET] = bucketName;
    }
    if (objectKey) {
      spanAttributes[ATTR_AWS_S3_KEY] = objectKey;
    }

    const isIncoming = false;

    return {
      isIncoming,
      spanAttributes,
      spanKind,
    };
  }
}
