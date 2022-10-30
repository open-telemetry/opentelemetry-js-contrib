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

import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export type EventName = keyof HTMLElementEventMap;

export type ShouldPreventSpanCreation = (
  eventType: EventName,
  element: HTMLElement,
  span: Span
) => boolean | void;

export interface UserInteractionInstrumentationConfig
  extends InstrumentationConfig {
  /**
   * List of events to instrument (like 'mousedown', 'touchend', 'play' etc).
   * By default only 'click' event is instrumented.
   */
  eventNames?: EventName[];

  /**
   * Callback function called each time new span is being created.
   * Return `true` to prevent span recording.
   * You can also use this handler to enhance created span with extra attributes.
   */
  shouldPreventSpanCreation?: ShouldPreventSpanCreation;
}
