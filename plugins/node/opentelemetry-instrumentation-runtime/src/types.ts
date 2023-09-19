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

export interface RuntimeInstrumentationConfig extends InstrumentationConfig {
  /**
   * The sampling rate in milliseconds.
   * Must be greater than zero.
   * @default 10
   * https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions
   */
  monitorEventLoopDelayResolution?: number;
}
