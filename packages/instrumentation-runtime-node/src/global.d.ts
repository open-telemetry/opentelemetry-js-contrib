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
import { Histogram } from 'perf_hooks';

declare module 'node:perf_hooks' {
  interface IntervalHistogram extends Histogram {
    /**
     * Enables the update interval timer. Returns `true` if the timer was
     * started, `false` if it was already started.
     * @since v11.10.0
     */
    enable(): boolean;

    /**
     * Disables the update interval timer. Returns `true` if the timer was
     * stopped, `false` if it was already stopped.
     * @since v11.10.0
     */
    disable(): boolean;

    count: number;
  }
}
