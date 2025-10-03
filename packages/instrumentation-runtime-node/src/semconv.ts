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

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

/**
 * The state of event loop time.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_NODEJS_EVENTLOOP_STATE = 'nodejs.eventloop.state' as const;

/**
 * The type of garbage collection.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_V8JS_GC_TYPE = 'v8js.gc.type' as const;

/**
 * The name of the space type of heap memory.
 *
 * @note Value can be retrieved from value `space_name` of [`v8.getHeapSpaceStatistics()`](https://nodejs.org/api/v8.html#v8getheapspacestatistics)
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_V8JS_HEAP_SPACE_NAME = 'v8js.heap.space.name' as const;

/**
 * Event loop maximum delay.
 *
 * @note Value can be retrieved from value `histogram.max` of [`perf_hooks.monitorEventLoopDelay([options])`](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions)
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_NODEJS_EVENTLOOP_DELAY_MAX =
  'nodejs.eventloop.delay.max' as const;

/**
 * Event loop mean delay.
 *
 * @note Value can be retrieved from value `histogram.mean` of [`perf_hooks.monitorEventLoopDelay([options])`](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions)
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_NODEJS_EVENTLOOP_DELAY_MEAN =
  'nodejs.eventloop.delay.mean' as const;

/**
 * Event loop minimum delay.
 *
 * @note Value can be retrieved from value `histogram.min` of [`perf_hooks.monitorEventLoopDelay([options])`](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions)
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_NODEJS_EVENTLOOP_DELAY_MIN =
  'nodejs.eventloop.delay.min' as const;

/**
 * Event loop 50 percentile delay.
 *
 * @note Value can be retrieved from value `histogram.percentile(50)` of [`perf_hooks.monitorEventLoopDelay([options])`](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions)
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_NODEJS_EVENTLOOP_DELAY_P50 =
  'nodejs.eventloop.delay.p50' as const;

/**
 * Event loop 90 percentile delay.
 *
 * @note Value can be retrieved from value `histogram.percentile(90)` of [`perf_hooks.monitorEventLoopDelay([options])`](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions)
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_NODEJS_EVENTLOOP_DELAY_P90 =
  'nodejs.eventloop.delay.p90' as const;

/**
 * Event loop 99 percentile delay.
 *
 * @note Value can be retrieved from value `histogram.percentile(99)` of [`perf_hooks.monitorEventLoopDelay([options])`](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions)
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_NODEJS_EVENTLOOP_DELAY_P99 =
  'nodejs.eventloop.delay.p99' as const;

/**
 * Event loop standard deviation delay.
 *
 * @note Value can be retrieved from value `histogram.stddev` of [`perf_hooks.monitorEventLoopDelay([options])`](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions)
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_NODEJS_EVENTLOOP_DELAY_STDDEV =
  'nodejs.eventloop.delay.stddev' as const;

/**
 * Cumulative duration of time the event loop has been in each state.
 *
 * @note Value can be retrieved from [`performance.eventLoopUtilization([utilization1[, utilization2]])`](https://nodejs.org/api/perf_hooks.html#performanceeventlooputilizationutilization1-utilization2)
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_NODEJS_EVENTLOOP_TIME = 'nodejs.eventloop.time' as const;

/**
 * Event loop utilization.
 *
 * @note The value range is [0.0, 1.0] and can be retrieved from [`performance.eventLoopUtilization([utilization1[, utilization2]])`](https://nodejs.org/api/perf_hooks.html#performanceeventlooputilizationutilization1-utilization2)
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_NODEJS_EVENTLOOP_UTILIZATION =
  'nodejs.eventloop.utilization' as const;

/**
 * Garbage collection duration.
 *
 * @note The values can be retrieved from [`perf_hooks.PerformanceObserver(...).observe({ entryTypes: ['gc'] })`](https://nodejs.org/api/perf_hooks.html#performanceobserverobserveoptions)
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_V8JS_GC_DURATION = 'v8js.gc.duration' as const;

/**
 * Total heap memory size pre-allocated.
 *
 * @note The value can be retrieved from value `space_size` of [`v8.getHeapSpaceStatistics()`](https://nodejs.org/api/v8.html#v8getheapspacestatistics)
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_V8JS_MEMORY_HEAP_LIMIT = 'v8js.memory.heap.limit' as const;

/**
 * Heap Memory size allocated.
 *
 * @note The value can be retrieved from value `space_used_size` of [`v8.getHeapSpaceStatistics()`](https://nodejs.org/api/v8.html#v8getheapspacestatistics)
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_V8JS_MEMORY_HEAP_USED = 'v8js.memory.heap.used' as const;

/**
 * Enum value "active" for attribute {@link ATTR_NODEJS_EVENTLOOP_STATE}.
 *
 * Active time.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const NODEJS_EVENTLOOP_STATE_VALUE_ACTIVE = 'active' as const;

/**
 * Enum value "idle" for attribute {@link ATTR_NODEJS_EVENTLOOP_STATE}.
 *
 * Idle time.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const NODEJS_EVENTLOOP_STATE_VALUE_IDLE = 'idle' as const;
