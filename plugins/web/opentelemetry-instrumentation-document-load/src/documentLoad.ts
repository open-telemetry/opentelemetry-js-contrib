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

import {
  context,
  propagation,
  setSpan,
  Span,
  ROOT_CONTEXT,
} from '@opentelemetry/api';
import { otperformance, TRACE_PARENT_HEADER } from '@opentelemetry/core';
import {
  addSpanNetworkEvent,
  addSpanNetworkEvents,
  hasKey,
  PerformanceEntries,
  PerformanceLegacy,
  PerformanceTimingNames as PTN,
} from '@opentelemetry/web';
import {
  InstrumentationBase,
  InstrumentationConfig,
} from '@opentelemetry/instrumentation';
import { AttributeNames } from './enums/AttributeNames';
import { VERSION } from './version';
import { HttpAttribute } from '@opentelemetry/semantic-conventions';

/**
 * This class represents a document load plugin
 */
export class DocumentLoadInstrumentation extends InstrumentationBase<unknown> {
  readonly component: string = 'document-load';
  readonly version: string = '1';
  moduleName = this.component;
  protected _config!: InstrumentationConfig;

  /**
   *
   * @param config
   */
  constructor(config: InstrumentationConfig = {}) {
    super('@opentelemetry/plugin-document-load', VERSION, config);
  }

  init() {}

  /**
   * callback to be executed when page is loaded
   */
  private _onDocumentLoaded() {
    // Timeout is needed as load event doesn't have yet the performance metrics for loadEnd.
    // Support for event "loadend" is very limited and cannot be used
    window.setTimeout(() => {
      this._collectPerformance();
    });
  }

  /**
   * Adds spans for all resources
   * @param rootSpan
   */
  private _addResourcesSpans(rootSpan: Span): void {
    const resources: PerformanceResourceTiming[] = otperformance.getEntriesByType?.(
      'resource'
    ) as PerformanceResourceTiming[];
    if (resources) {
      resources.forEach(resource => {
        this._initResourceSpan(resource, rootSpan);
      });
    }
  }

  /**
   * Collects information about performance and creates appropriate spans
   */
  private _collectPerformance() {
    const metaElement = [...document.getElementsByTagName('meta')].find(
      e => e.getAttribute('name') === TRACE_PARENT_HEADER
    );
    const entries = this._getEntries();
    const traceparent = (metaElement && metaElement.content) || '';
    context.with(propagation.extract(ROOT_CONTEXT, { traceparent }), () => {
      const rootSpan = this._startSpan(
        AttributeNames.DOCUMENT_LOAD,
        PTN.FETCH_START,
        entries
      );
      if (!rootSpan) {
        return;
      }
      context.with(setSpan(context.active(), rootSpan), () => {
        const fetchSpan = this._startSpan(
          AttributeNames.DOCUMENT_FETCH,
          PTN.FETCH_START,
          entries
        );
        if (fetchSpan) {
          context.with(setSpan(context.active(), fetchSpan), () => {
            addSpanNetworkEvents(fetchSpan, entries);
            this._endSpan(fetchSpan, PTN.RESPONSE_END, entries);
          });
        }
      });

      this._addResourcesSpans(rootSpan);

      addSpanNetworkEvent(rootSpan, PTN.FETCH_START, entries);
      addSpanNetworkEvent(rootSpan, PTN.UNLOAD_EVENT_START, entries);
      addSpanNetworkEvent(rootSpan, PTN.UNLOAD_EVENT_END, entries);
      addSpanNetworkEvent(rootSpan, PTN.DOM_INTERACTIVE, entries);
      addSpanNetworkEvent(
        rootSpan,
        PTN.DOM_CONTENT_LOADED_EVENT_START,
        entries
      );
      addSpanNetworkEvent(rootSpan, PTN.DOM_CONTENT_LOADED_EVENT_END, entries);
      addSpanNetworkEvent(rootSpan, PTN.DOM_COMPLETE, entries);
      addSpanNetworkEvent(rootSpan, PTN.LOAD_EVENT_START, entries);
      addSpanNetworkEvent(rootSpan, PTN.LOAD_EVENT_END, entries);

      this._endSpan(rootSpan, PTN.LOAD_EVENT_END, entries);
    });
  }

  /**
   * Helper function for ending span
   * @param span
   * @param performanceName name of performance entry for time end
   * @param entries
   */
  private _endSpan(
    span: Span | undefined,
    performanceName: string,
    entries: PerformanceEntries
  ) {
    // span can be undefined when entries are missing the certain performance - the span will not be created
    if (span) {
      if (hasKey(entries, performanceName)) {
        span.end(entries[performanceName]);
      } else {
        // just end span
        span.end();
      }
    }
  }

  /**
   * gets performance entries of navigation
   */
  private _getEntries() {
    const entries: PerformanceEntries = {};
    const performanceNavigationTiming = (otperformance.getEntriesByType?.(
      'navigation'
    )[0] as unknown) as PerformanceEntries;

    if (performanceNavigationTiming) {
      const keys = Object.values(PTN);
      keys.forEach((key: string) => {
        if (hasKey(performanceNavigationTiming, key)) {
          const value = performanceNavigationTiming[key];
          if (typeof value === 'number') {
            entries[key] = value;
          }
        }
      });
    } else {
      // // fallback to previous version
      const perf: typeof otperformance & PerformanceLegacy = otperformance;
      const performanceTiming = perf.timing;
      if (performanceTiming) {
        const keys = Object.values(PTN);
        keys.forEach((key: string) => {
          if (hasKey(performanceTiming, key)) {
            const value = performanceTiming[key];
            if (typeof value === 'number') {
              entries[key] = value;
            }
          }
        });
      }
    }
    return entries;
  }

  /**
   * Creates and ends a span with network information about resource added as timed events
   * @param resource
   * @param parentSpan
   */
  private _initResourceSpan(
    resource: PerformanceResourceTiming,
    parentSpan: Span
  ) {
    const span = this._startSpan(
      AttributeNames.RESOURCE_FETCH,
      PTN.FETCH_START,
      resource,
      parentSpan
    );
    if (span) {
      span.setAttribute(HttpAttribute.HTTP_URL, resource.name);
      addSpanNetworkEvents(span, resource);
      this._endSpan(span, PTN.RESPONSE_END, resource);
    }
  }

  /**
   * Helper function for starting a span
   * @param spanName name of span
   * @param performanceName name of performance entry for time start
   * @param entries
   * @param parentSpan
   */
  private _startSpan(
    spanName: string,
    performanceName: string,
    entries: PerformanceEntries,
    parentSpan?: Span
  ): Span | undefined {
    if (
      hasKey(entries, performanceName) &&
      typeof entries[performanceName] === 'number'
    ) {
      const span = this.tracer.startSpan(
        spanName,
        {
          startTime: entries[performanceName],
        },
        parentSpan ? setSpan(context.active(), parentSpan) : undefined
      );
      span.setAttribute(AttributeNames.COMPONENT, this.component);
      return span;
    }
    return undefined;
  }

  /**
   * executes callback {_onDocumentLoaded} when the page is loaded
   */
  private _waitForPageLoad() {
    if (window.document.readyState === 'complete') {
      this._onDocumentLoaded();
    } else {
      this._onDocumentLoaded = this._onDocumentLoaded.bind(this);
      window.addEventListener('load', this._onDocumentLoaded);
    }
  }

  /**
   * implements enable function
   */
  enable() {
    // remove previously attached load to avoid adding the same event twice
    // in case of multiple enable calling.
    window.removeEventListener('load', this._onDocumentLoaded);
    this._waitForPageLoad();
  }

  /**
   * implements disable function
   */
  disable() {
    window.removeEventListener('load', this._onDocumentLoaded);
  }
}
