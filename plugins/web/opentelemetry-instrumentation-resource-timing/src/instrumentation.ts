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
import { InstrumentationBase, InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { events, EventLogger } from '@opentelemetry/api-events';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import type {
  ResourceTimingInstrumentationConfig,
} from './types';





export class ResourceTimingInstrumentation extends InstrumentationBase {
  protected override init(): void | InstrumentationModuleDefinition | InstrumentationModuleDefinition[] {
    throw new Error('Method not implemented.');
  }
  readonly version: string = PACKAGE_VERSION;

  override _config : ResourceTimingInstrumentationConfig = {};
  private _eventLogger: EventLogger;
  private _observer: PerformanceObserver | undefined;


  private static initiatorTypes: string[] = ['fetch', 'xmlhttprequest'];

  constructor(config: ResourceTimingInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    this._eventLogger = events.getEventLogger('@opentelemetry/instrumentation-resource-timing');
    this._config = config;
    this._config.initiatorTypes = this._config.initiatorTypes || [];
    for (const initiatorType of ResourceTimingInstrumentation.initiatorTypes) {
      if (!this._config.initiatorTypes.includes(initiatorType)) {
        this._config.initiatorTypes.push(initiatorType);
      }
    }
  }

  private  createEvent(entry: PerformanceResourceTiming) {
    const now = Date.now();

    const event = {
      name: 'browser.resource_timing',
      data: {
        name: entry.name,
        initiatorType: entry.initiatorType,
        startTime: entry.startTime,
        duration: entry.duration,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
        nextHopProtocol: entry.nextHopProtocol,
        fetchStart: entry.fetchStart,
        domainLookupStart: entry.domainLookupStart,
        domainLookupEnd: entry.domainLookupEnd,
        connectStart: entry.connectStart,
        secureConnectionStart: entry.secureConnectionStart,
        connectEnd: entry.connectEnd,
        requestStart: entry.requestStart,
        responseStart: entry.responseStart,
        responseEnd: entry.responseEnd,
      },
      timestamp: now,
    }
    return event;
  }
  
  private _createResourceObserver() {
    this._observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      console.log('Received resource entries:', entries); // Log entries for debugging
      for (const entry of entries) {
        if (entry.entryType === 'resource' && this._config.initiatorTypes && 
          this._config.initiatorTypes.includes((entry as PerformanceResourceTiming).initiatorType)) {
          console.log('Emitting resource entry:', entry); // Log emitted entry for debugging
          this._eventLogger.emit(this.createEvent (entry as PerformanceResourceTiming));
        }
      }
    });
  
    this._observer.observe({ entryTypes: ['resource'] });
    console.log('Resource observer created'); // Log observer creation for debugging
  }

  override enable() {
    if (this._observer) {
      return;
    }

    this._createResourceObserver();
  }

  override disable() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = undefined;
    }
  }
}
