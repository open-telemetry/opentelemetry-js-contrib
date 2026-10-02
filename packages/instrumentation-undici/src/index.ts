/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export { UndiciInstrumentation } from './undici';
export type {
  IgnoreRequestFunction,
  RequestHookFunction,
  ResponseHookFunction,
  StartSpanHookFunction,
  UndiciInstrumentationConfig,
  UndiciRequest,
  UndiciResponse,
} from './types';
