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
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface PerfHooksInstrumentationConfig extends InstrumentationConfig {
  /**
   * The approximate number of milliseconds for which to calculate event loop utilization averages.
   * A larger value will result in more accurate averages at the expense of less granular data.
   * Should be set to below the scrape interval of your metrics collector to avoid duplicated data points.
   * @default 5000
   */
  eventLoopUtilizationMeasurementInterval?: number;
}
