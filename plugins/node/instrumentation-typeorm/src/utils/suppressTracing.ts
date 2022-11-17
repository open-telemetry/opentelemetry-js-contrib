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
import { createContextKey, Context } from '@opentelemetry/api';

const SUPPRESS_TYPEORM_INTERNAL_TRACING_KEY = createContextKey(
  'instrumentation-typeorm Context Key SUPPRESS_TYPEORM_INTERNAL_TRACING'
);

export const suppressTypeormInternalTracing = (context: Context) =>
  context.setValue(SUPPRESS_TYPEORM_INTERNAL_TRACING_KEY, true);

export const isTypeormInternalTracingSuppressed = (context: Context) =>
  context.getValue(SUPPRESS_TYPEORM_INTERNAL_TRACING_KEY) === true;
