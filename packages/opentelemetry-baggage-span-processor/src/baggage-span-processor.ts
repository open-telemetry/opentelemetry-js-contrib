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

import { Context, propagation } from '@opentelemetry/api';
import {
  NoopSpanProcessor,
  Span,
} from '@opentelemetry/sdk-trace-base';

/**
 * The BaggageSpanProcessor reads entries stored in {@link Baggage}
 * from the parent context and adds the baggage entries' keys and
 * values to the span as attributes on span start.
 *
 * Add this span processor to a tracer provider.
 *
 * Keys and values added to Baggage will appear on subsequent child
 * spans for a trace within this service *and* be propagated to external
 * services in accordance with any configured propagation formats
 * configured. If the external services also have a Baggage span
 * processor, the keys and values will appear in those child spans as
 * well.
 *
 * ⚠ Warning ⚠️
 *
 * Do not put sensitive information in Baggage.
 *
 * To repeat: a consequence of adding data to Baggage is that the keys and
 * values will appear in all outgoing HTTP headers from the application.
 */
export class BaggageSpanProcessor extends NoopSpanProcessor {
  /**
   * Adds an attribute to the `span` for each {@link Baggage} key and {@link BaggageEntry | entry value}
   * present in the `parentContext`.
   *
   * @param span a {@link Span} being started
   * @param parentContext the {@link Context} in which `span` was started
   */
  override onStart(span: Span, parentContext: Context): void {
    (propagation.getBaggage(parentContext)?.getAllEntries() ?? []).forEach(
      (entry) => {
        span.setAttribute(entry[0], entry[1].value);
      },
    );
  }
}
