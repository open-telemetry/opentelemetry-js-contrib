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
   * The sampling rate in milliseconds of event loop delay.
   * Setting this too high will result in inaccurate data, as the baseline
   * will be skewed by this value.
   * @default 10
   */
  monitorEventLoopDelayResolution?: number;
  /**
   * The sampling rate in milliseconds of event loop utilization.
   * If you are using PeriodicExportingMetricReader it is recommended to set
   * this value to (at most) half of what exportIntervalMillis is set to.
   * @default 30000
   */
  monitorEventLoopUtilizationResolution?: number;
}
