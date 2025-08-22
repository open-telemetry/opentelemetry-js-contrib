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

export interface OpenAIInstrumentationConfig extends InstrumentationConfig {
  /**
   * Set to true to enable capture of content data, such as prompt and
   * completion content, tool call function arguments, etc. By default, this is
   * `false` to avoid possible exposure of sensitive data. This can also be set
   * via the `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`
   * environment variable.
   */
  captureMessageContent?: boolean;
}
