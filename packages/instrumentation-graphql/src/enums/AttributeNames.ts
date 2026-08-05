/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
export enum AttributeNames {
  SOURCE = 'graphql.source',
  FIELD_NAME = 'graphql.field.name',
  FIELD_PATH = 'graphql.field.path',
  FIELD_TYPE = 'graphql.field.type',
  PARENT_NAME = 'graphql.parent.name',
  OPERATION_TYPE = 'graphql.operation.type',
  OPERATION_NAME = 'graphql.operation.name',
  VARIABLES = 'graphql.variables.',
  ERROR_VALIDATION_NAME = 'graphql.validation.error',
}
