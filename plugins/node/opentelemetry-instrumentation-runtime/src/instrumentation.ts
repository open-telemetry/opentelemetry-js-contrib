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

import { InstrumentationBase } from "@opentelemetry/instrumentation";
import { createEventLoopLagMetrics } from "./metrics/event-loop-lag";
import { RuntimeInstrumentationConfig } from "./types";
import { VERSION } from "./version";
import { monitorEventLoopDelay } from "perf_hooks";

/**
 * Runtime instrumentation for Opentelemetry
 */
export class RuntimeInstrumentation extends InstrumentationBase {
  constructor(protected override _config: RuntimeInstrumentationConfig = {}) {
    super("@opentelemetry/instrumentation-runtime", VERSION, _config);
  }

  override setConfig(config: RuntimeInstrumentationConfig = {}) {
    this._config = config;
  }

  init() {
    const histogram = monitorEventLoopDelay({
      resolution: this._config.monitorEventLoopDelayResolution,
    });

    histogram.enable();

    createEventLoopLagMetrics(this.meter, histogram);
  }
}
