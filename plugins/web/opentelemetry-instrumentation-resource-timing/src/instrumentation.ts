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
import { Event as LogEvent } from '@opentelemetry/api-events';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import type {
  ResourceTimingInstrumentationConfig, SpanContextData
} from './types';
import { ResourceTimingEventFields } from './types';
import {
  hrTimeToNanoseconds,
  timeInputToHrTime,
} from '@opentelemetry/core';
import { context, trace, SpanContext, TraceFlags } from '@opentelemetry/api';

const MAX_TIME_FINDING_SPAN_CONTEXT = 100; // milliseconds
const MAX_ATTEMPTS_FINDING_SPAN_CONTEXT = 5;
const TIME_ALLOWANCE_FOR_SPAN_CONTEXT = 4000; // milliseconds
const RESOURCE_FETCH_INITIATED = '@opentelemetry/ResourceFetchInitiated'; // TODO: duplicated in fetch2 instrumentation


export class ResourceTimingInstrumentation extends InstrumentationBase {
  protected override init(): void | InstrumentationModuleDefinition | InstrumentationModuleDefinition[] {
    throw new Error('Method not implemented.');
  }
  readonly version: string = PACKAGE_VERSION;


  override _config: ResourceTimingInstrumentationConfig = {};
  private _eventLogger: EventLogger;
  private _observer: PerformanceObserver | undefined;

  // private spanContextEntries: Map<string, any> = new Map();
  private spanContextEntries: SpanContextData[];


  private initiatorTypes: string[] = ['fetch', 'xmlhttprequest'];

  constructor(config: ResourceTimingInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    this._eventLogger = events.getEventLogger('@opentelemetry/instrumentation-resource-timing');
    this.spanContextEntries = [];
    this._config = config;
    if (this._config.additionalInitiatorTypes) {
      for (const initiatorType of this._config.additionalInitiatorTypes) {
        if (!this.initiatorTypes.includes(initiatorType)) {
          this.initiatorTypes.push(initiatorType);
        }
      }
    }
  }

  private  createEvent(entry: PerformanceResourceTiming): LogEvent {
    const now = Date.now();

    const event: {
      timestamp: number;
      name: string;
      data: {
        [key: string]: any; //Required for any string to index `data`
      };
    } = {
      timestamp: now,
      name: 'browser.resource_timing',
      data: {
        // predefined properties here
      }
    };

    interface PerformanceResourceTimingExtended extends PerformanceResourceTiming {
      [key: string]: any; // Required for any string to index `PerformanceResourceTiming` entry
    }
    const entryExtended = entry as PerformanceResourceTimingExtended;

    event.data[ResourceTimingEventFields.NAME] = entryExtended[ResourceTimingEventFields.NAME];
    event.data[ResourceTimingEventFields.INITATOR_TYPE] = entryExtended[ResourceTimingEventFields.INITATOR_TYPE];
    event.data[ResourceTimingEventFields.FETCHSTART] = entryExtended[ResourceTimingEventFields.FETCHSTART];
    event.data[ResourceTimingEventFields.DOMAINLOOKUPSTART] = entryExtended[ResourceTimingEventFields.DOMAINLOOKUPSTART];
    event.data[ResourceTimingEventFields.DOMAINLOOKUPEND] = entryExtended[ResourceTimingEventFields.DOMAINLOOKUPEND];
    event.data[ResourceTimingEventFields.CONNECTSTART] = entryExtended[ResourceTimingEventFields.CONNECTSTART];
    event.data[ResourceTimingEventFields.SECURECONNECTIONSTART] = entryExtended[ResourceTimingEventFields.SECURECONNECTIONSTART];
    event.data[ResourceTimingEventFields.CONNECTEND] = entryExtended[ResourceTimingEventFields.CONNECTEND];
    event.data[ResourceTimingEventFields.REQUESTSTART] = entryExtended[ResourceTimingEventFields.REQUESTSTART];
    event.data[ResourceTimingEventFields.RESPONSESTART] = entryExtended[ResourceTimingEventFields.RESPONSESTART];
    event.data[ResourceTimingEventFields.RESPONSEEND] = entryExtended[ResourceTimingEventFields.RESPONSEEND];

    return event as LogEvent;
  }

  private findMatchingSpanContext(resourceTimingEntry: PerformanceResourceTiming): SpanContextData | undefined {
    // let spanContextEntries = this.spanContextEntries.get(resourceTimingEntry.name);
    // if (!spanContextEntries) {
    //   return undefined;
    // }

    const resourceStartTime = hrTimeToNanoseconds(
      timeInputToHrTime(resourceTimingEntry.fetchStart)
    );

    const resourceEndTime = hrTimeToNanoseconds(
      timeInputToHrTime(resourceTimingEntry.responseEnd)
    );

    for (const spanContextData of this.spanContextEntries) {
      if (resourceTimingEntry.name === spanContextData.url &&
        spanContextData.initiatorType.toLowerCase() === resourceTimingEntry.initiatorType &&
        resourceStartTime >= hrTimeToNanoseconds(spanContextData.startTime) && 
        resourceEndTime <= hrTimeToNanoseconds(spanContextData.endTime)) {
        return spanContextData;
      }
    }

    return undefined;
  }
  
  // private resourceObserver(list: PerformanceObserverEntryList) {

  //   const entries = list.getEntries();
  //   for (const entry of entries) {
  //     if (entry.entryType === 'resource' && 
  //       this.initiatorTypes.includes((entry as PerformanceResourceTiming).initiatorType)) {
  //       const event:LogEvent = this.createEvent(entry as PerformanceResourceTiming);
  //       const spanContextData = this.findMatchingSpanContext(entry as PerformanceResourceTiming);
  //       if (spanContextData) {
  //         console.log('Found matching span context:', event, spanContextData);
  //         const traceId = spanContextData.traceId;
  //         const spanId = spanContextData.spanId;
  //         const spanContext: SpanContext = {traceId, spanId, traceFlags: TraceFlags.NONE};
  //         event.context = trace.setSpanContext(context.active(), spanContext);

  //       }
  //       this._eventLogger.emit(event);
  //     }
  //   }
  // }

  private resourceObserver(list: PerformanceObserverEntryList) {
    const entries = list.getEntries();
    for (const entry of entries) {
      if (entry.entryType === 'resource' && 
        this.initiatorTypes.includes((entry as PerformanceResourceTiming).initiatorType)) {
          // TODO: we could possibly add a config to emit the entry right away without waiting
          // long looking for span context.
          

          console.log("Received resource entry: ", entry)
          this.attachSpanContextAndEmit(entry as PerformanceResourceTiming, 1);
          break;
      }
    }
  }

  private attachSpanContextAndEmit(entry: PerformanceResourceTiming, attempts: number) {
    console.log("Finding span context: ", Date.now(), entry, attempts);
    const spanContextData = this.findMatchingSpanContext(entry as PerformanceResourceTiming);
    if (!spanContextData && attempts < MAX_ATTEMPTS_FINDING_SPAN_CONTEXT) {
      setTimeout (this.attachSpanContextAndEmit.bind(this, entry, attempts + 1), MAX_TIME_FINDING_SPAN_CONTEXT * (2 ** attempts));
      return;
    }
    const event:LogEvent = this.createEvent(entry as PerformanceResourceTiming);

    if (spanContextData) {
      console.log('Attaching span context found:', attempts, event, spanContextData);
      const traceId = spanContextData.traceId;
      const spanId = spanContextData.spanId;
      const spanContext: SpanContext = {traceId, spanId, traceFlags: TraceFlags.NONE};
      event.context = trace.setSpanContext(context.active(), spanContext);
      setTimeout(() => {
        // We will keep the span context entry around for some time should it be needed
        // for the CORS preflight request resource timing entry.
        const index = this.spanContextEntries.findIndex(entry => entry === spanContextData);
        if (index !== -1) {
          this.spanContextEntries.splice(index, 1);
          console.log("Removed span context entry", spanContextData);
        }
      }, TIME_ALLOWANCE_FOR_SPAN_CONTEXT);

    }
    this._eventLogger.emit(event);
  }

  private _createResourceObserver() {
    this._observer = new PerformanceObserver(this.resourceObserver.bind(this));
    this._observer.observe({ entryTypes: ['resource'] });
  }

  private onSpanContextReceived(event: Event) {
    const spanContextData: SpanContextData = (event as CustomEvent).detail;
      if (spanContextData) {
        console.log('Received span context:', spanContextData); // Log received span context for debugging
        this.spanContextEntries.push(spanContextData);
      } 
  }

  override enable() {
    if (this._observer) {
      return;
    }
    document.addEventListener(RESOURCE_FETCH_INITIATED, this.onSpanContextReceived.bind(this));
    this._createResourceObserver();
  }

  override disable() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = undefined;
    }
    document.removeEventListener(RESOURCE_FETCH_INITIATED, this.onSpanContextReceived);
  }
}
