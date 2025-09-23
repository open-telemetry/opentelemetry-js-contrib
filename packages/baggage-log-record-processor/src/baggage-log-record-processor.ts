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

import { BaggageKeyPredicate } from './types';
import { Context, propagation } from '@opentelemetry/api';
import { SdkLogRecord, LogRecordProcessor } from '@opentelemetry/sdk-logs';

/**
 * BaggageLogRecordProcessor is a {@link LogRecordProcessor} that reads entries stored in {@link Baggage}
 * from the parent context and adds the baggage entries' keys and
 * values to the log as attributes on log emit.
 *
 * ⚠ Warning ⚠️
 *
 * Do not put sensitive information in Baggage.
 *
 * To repeat: a consequence of adding data to Baggage is that the keys and
 * values will appear in all outgoing HTTP headers from the application.
 */
export class BaggageLogRecordProcessor implements LogRecordProcessor {
  private _keyPredicate: BaggageKeyPredicate;

  /**
   * Constructs a new BaggageLogRecordProcessor instance.
   * @param keyPredicate A predicate that determines whether a baggage key-value pair should be added to new log as a log attribute.
   */
  constructor(keyPredicate: BaggageKeyPredicate) {
    this._keyPredicate = keyPredicate;
  }

  /**
   * Forces to export all finished log records.
   */
  forceFlush(): Promise<void> {
    // no-op
    return Promise.resolve();
  }

  /**
   * Called when a {@link SdkLogRecord} is emit
   * @param logRecord the ReadWriteLogRecord that just emitted.
   * @param context the current Context, or an empty Context if the Logger was obtained with include_trace_context=false
   */
  onEmit(logRecord: SdkLogRecord, context?: Context): void {
    if (context) {
      (propagation.getBaggage(context)?.getAllEntries() ?? [])
        .filter(entry => this._keyPredicate(entry[0]))
        .forEach(entry => logRecord.setAttribute(entry[0], entry[1].value));
    }
  }

  /**
   * Shuts down the processor. Called when SDK is shut down. This is an
   * opportunity for processor to do any cleanup required.
   */
  shutdown(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
