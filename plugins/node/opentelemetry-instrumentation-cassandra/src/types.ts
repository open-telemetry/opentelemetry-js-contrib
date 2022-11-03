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
import { Span } from '@opentelemetry/api';

export interface Row {
  get(columnName: string | number): any;

  keys(): string[];

  forEach(callback: (row: Row) => void): void;

  values(): any[];

  [key: string]: any;
}

// https://github.com/datastax/nodejs-driver/blob/d42176e4baa1cfc3df79699cc3b5d575c86e3cec/lib/types/index.d.ts#L323
export interface ResultSet {
  rows: Row[];
}

export interface ResponseHookInfo {
  response: ResultSet;
}

export interface CassandraDriverResponseCustomAttributeFunction {
  (span: Span, responseInfo: ResponseHookInfo): void;
}

export interface CassandraDriverInstrumentationConfig
  extends InstrumentationConfig {
  /**
   * Include database statements with spans.
   * These can contain sensitive information when using unescaped queries.
   * @default false
   */
  enhancedDatabaseReporting?: boolean;
  /**
   * Max recorded query length.
   * @default 65536
   */
  maxQueryLength?: number;
  /**
   * Function for adding custom attributes before response is handled.
   * @param span the current span
   * @param responseInfo array of the resulting rows. This will only return the first page of results
   */
  responseHook?: CassandraDriverResponseCustomAttributeFunction;
}
