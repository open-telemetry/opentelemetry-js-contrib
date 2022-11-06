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

import { IntervalHistogram } from "perf_hooks";
import { Meter } from "@opentelemetry/api-metrics";

export const createEventLoopLagMetrics = (
  meter: Meter,
  histogram: IntervalHistogram
) => {
  meter
    .createObservableGauge("process.runtime.nodejs.eventloop.lag", {
      description: "Lag of event loop.",
      unit: "seconds",
    })
    .addCallback(async (observable) => {
      const startTime = process.hrtime();
      await new Promise<void>((resolve) => setImmediate(() => resolve()));
      const delta = process.hrtime(startTime);
      const seconds = delta[0] + delta[1] / 1e9;
      observable.observe(seconds);
    });

  meter
    .createObservableGauge("process.runtime.nodejs.eventloop.lag.min", {
      description: "The minimum recorded event loop delay.",
      unit: "seconds",
    })
    .addCallback((observable) => {
      observable.observe(histogram.min / 1e9);
    });

  meter
    .createObservableGauge("process.runtime.nodejs.eventloop.lag.max", {
      description: "The maximum recorded event loop delay.",
      unit: "seconds",
    })
    .addCallback((observable) => {
      observable.observe(histogram.max / 1e9);
    });

  meter
    .createObservableGauge("process.runtime.nodejs.eventloop.lag.mean", {
      description: "The mean of the recorded event loop delays.",
      unit: "seconds",
    })
    .addCallback((observable) => {
      observable.observe(histogram.mean / 1e9);
    });

  meter
    .createObservableGauge("process.runtime.nodejs.eventloop.lag.stddev", {
      description: "The standard deviation of the recorded event loop delays.",
      unit: "seconds",
    })
    .addCallback((observable) => {
      observable.observe(histogram.stddev / 1e9);
    });

  meter
    .createObservableGauge("process.runtime.nodejs.eventloop.lag.p50", {
      description: "The 50th percentile of the recorded event loop delays.",
      unit: "seconds",
    })
    .addCallback((observable) => {
      observable.observe(histogram.percentile(50) / 1e9);
    });

  meter
    .createObservableGauge("process.runtime.nodejs.eventloop.lag.p90", {
      description: "The 90th percentile of the recorded event loop delays.",
      unit: "seconds",
    })
    .addCallback((observable) => {
      observable.observe(histogram.percentile(90) / 1e9);
    });

  meter
    .createObservableGauge("process.runtime.nodejs.eventloop.lag.p99", {
      description: "The 99th percentile of the recorded event loop delays.",
      unit: "seconds",
    })
    .addCallback((observable) => {
      observable.observe(histogram.percentile(99) / 1e9);
    });
};
