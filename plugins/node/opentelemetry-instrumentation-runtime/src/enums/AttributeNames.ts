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

/**
 * https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/trace/semantic_conventions/http.md
 */
export enum AttributeNames {
  NODE_EVENT_LOOP_DELAY = 'node.event_loop_delay',
  NODE_EVENT_LOOP_DELAY_MIN = 'node.event_loop_delay.min',
  NODE_EVENT_LOOP_DELAY_MAX = 'node.event_loop_delay.max',
  NODE_EVENT_LOOP_DELAY_MEAN = 'node.event_loop_delay.mean',
  NODE_EVENT_LOOP_DELAY_STDDEV = 'node.event_loop_delay.stddev',
  NODE_EVENT_LOOP_DELAY_P50 = 'node.event_loop_delay.p50',
  NODE_EVENT_LOOP_DELAY_P95 = 'node.event_loop_delay.p95',
  NODE_EVENT_LOOP_DELAY_P99 = 'node.event_loop_delay.p99',
  NODE_EVENT_LOOP_UTILIZATION = 'node.event_loop_utilization',
  NODE_EVENT_LOOP_UTILIZATION_IDLE = 'node.event_loop_utilization.idle',
  NODE_EVENT_LOOP_UTILIZATION_ACTIVE = 'node.event_loop_utilization.active',
}
