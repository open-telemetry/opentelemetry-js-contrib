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

export enum AttributeNames {
  // https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/semantic_conventions
  INSTRUMENTATION_NAME = 'otel.scope.name',
  INSTRUMENTATION_VERSION = 'otel.scope.version',
  HTTP_URL = 'http.url',
  HTTP_USER_AGENT = 'http.user_agent',

  // NOT ON OFFICIAL SPEC
  EVENT_TYPE = 'event_type',
  TARGET_ELEMENT = 'target_element',
  TARGET_XPATH = 'target_xpath',
  LISTENERS_COUNT = 'listeners.count',
  TASKS_SCHEDULED_COUNT = 'tasks.scheduled.count',
  TASKS_RAN_COUNT = 'tasks.ran.count',
  TASKS_CANCELLED_COUNT = 'tasks.cancelled.count',
}
