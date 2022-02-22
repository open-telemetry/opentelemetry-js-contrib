/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { Span } from '@opentelemetry/api';

export interface MySQL2ResponseHookInformation {
  queryResults: any;
}

export interface MySQL2InstrumentationExecutionResponseHook {
  (span: Span, responseHookInfo: MySQL2ResponseHookInformation): void;
}

export interface MySQL2InstrumentationConfig extends InstrumentationConfig {
  /**
   * Hook that allows adding custom span attributes based on the data
   * returned MySQL2 queries.
   *
   * @default undefined
   */
  responseHook?: MySQL2InstrumentationExecutionResponseHook;
}
