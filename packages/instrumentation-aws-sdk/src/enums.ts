/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
export enum AttributeNames {
  AWS_OPERATION = 'aws.operation',
  CLOUD_REGION = 'cloud.region',
  AWS_SERVICE_API = 'aws.service.api',
  AWS_SERVICE_NAME = 'aws.service.name',
  AWS_SERVICE_IDENTIFIER = 'aws.service.identifier',
  AWS_REQUEST_ID = 'aws.request.id',
  AWS_REQUEST_EXTENDED_ID = 'aws.request.extended_id',
  AWS_SIGNATURE_VERSION = 'aws.signature.version',

  // TODO: Add these semantic attributes to:
  // - https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-semantic-conventions/src/trace/SemanticAttributes.ts
  // For S3, see specification: https://github.com/open-telemetry/semantic-conventions/blob/main/docs/object-stores/s3.md
  AWS_S3_BUCKET = 'aws.s3.bucket',
  AWS_KINESIS_STREAM_NAME = 'aws.kinesis.stream.name',
}
