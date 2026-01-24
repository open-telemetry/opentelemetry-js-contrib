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
  trace,
  Span,
  ROOT_CONTEXT,
} from '@opentelemetry/api';
import { otperformance, TRACE_PARENT_HEADER } from '@opentelemetry/core';
import {
  addSpanNetworkEvent,
  addSpanNetworkEvents,
  hasKey,
  PerformanceEntries,
  PerformanceTimingNames as PTN,
} from '@opentelemetry/sdk-trace-web';
import {
  SemconvStability,
  semconvStabilityFromStr,
  InstrumentationBase,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import {
  ATTR_URL_FULL,
  ATTR_USER_AGENT_ORIGINAL,
} from '@opentelemetry/semantic-conventions';
import {
  DocumentLoadCustomAttributeFunction,
  DocumentLoadInstrumentationConfig,
  ResourceFetchCustomAttributeFunction,
} from './types';
import { AttributeNames } from './enums/AttributeNames';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { ATTR_HTTP_URL, ATTR_HTTP_USER_AGENT } from './semconv';
import {
  addSpanPerformancePaintEvents,
  getPerformanceNavigationEntries,
} from './utils';

/**
 * This class represents a document load plugin
 */
export class DocumentLoadInstrumentation extends InstrumentationBase<DocumentLoadInstrumentationConfig> {
  readonly component: string = 'document-load';
  readonly version: string = '1';
  moduleName = this.component;

  private _semconvStability: SemconvStability;

  constructor(config: DocumentLoadInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    this._semconvStability = semconvStabilityFromStr(
      'http',
      config?.semconvStabilityOptIn
    );
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
    const resources: PerformanceResourceTiming[] = (
      otperformance as unknown as Performance
    ).getEntriesByType?.('resource') as PerformanceResourceTiming[];
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
    const metaElement = Array.from(document.getElementsByTagName('meta')).find(
      e => e.getAttribute('name') === TRACE_PARENT_HEADER
    );
    const entries = getPerformanceNavigationEntries();
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
      context.with(trace.setSpan(context.active(), rootSpan), () => {
        const fetchSpan = this._startSpan(
          AttributeNames.DOCUMENT_FETCH,
          PTN.FETCH_START,
          entries
        );
        if (fetchSpan) {
          if (this._semconvStability & SemconvStability.OLD) {
            fetchSpan.setAttribute(ATTR_HTTP_URL, location.href);
          }
          if (this._semconvStability & SemconvStability.STABLE) {
            fetchSpan.setAttribute(ATTR_URL_FULL, location.href);
          }
          context.with(trace.setSpan(context.active(), fetchSpan), () => {
            const skipOldSemconvContentLengthAttrs = !(
              this._semconvStability & SemconvStability.OLD
            );
            addSpanNetworkEvents(
              fetchSpan,
              entries,
              this.getConfig().ignoreNetworkEvents,
              undefined,
              skipOldSemconvContentLengthAttrs
            );
            this._addCustomAttributesOnSpan(
              fetchSpan,
              this.getConfig().applyCustomAttributesOnSpan?.documentFetch
            );
            this._endSpan(fetchSpan, PTN.RESPONSE_END, entries);
          });
        }
      });

      if (this._semconvStability & SemconvStability.OLD) {
        rootSpan.setAttribute(ATTR_HTTP_URL, location.href);
        rootSpan.setAttribute(ATTR_HTTP_USER_AGENT, navigator.userAgent);
      }
      if (this._semconvStability & SemconvStability.STABLE) {
        rootSpan.setAttribute(ATTR_URL_FULL, location.href);
        rootSpan.setAttribute(ATTR_USER_AGENT_ORIGINAL, navigator.userAgent);
      }

      this._addResourcesSpans(rootSpan);

      if (!this.getConfig().ignoreNetworkEvents) {
        addSpanNetworkEvent(rootSpan, PTN.FETCH_START, entries);
        addSpanNetworkEvent(rootSpan, PTN.UNLOAD_EVENT_START, entries);
        addSpanNetworkEvent(rootSpan, PTN.UNLOAD_EVENT_END, entries);
        addSpanNetworkEvent(rootSpan, PTN.DOM_INTERACTIVE, entries);
        addSpanNetworkEvent(
          rootSpan,
          PTN.DOM_CONTENT_LOADED_EVENT_START,
          entries
        );
        addSpanNetworkEvent(
          rootSpan,
          PTN.DOM_CONTENT_LOADED_EVENT_END,
          entries
        );
        addSpanNetworkEvent(rootSpan, PTN.DOM_COMPLETE, entries);
        addSpanNetworkEvent(rootSpan, PTN.LOAD_EVENT_START, entries);
        addSpanNetworkEvent(rootSpan, PTN.LOAD_EVENT_END, entries);
      }

      if (!this.getConfig().ignorePerformancePaintEvents) {
        addSpanPerformancePaintEvents(rootSpan);
      }

      this._addCustomAttributesOnSpan(
        rootSpan,
        this.getConfig().applyCustomAttributesOnSpan?.documentLoad
      );
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
      if (this._semconvStability & SemconvStability.OLD) {
        span.setAttribute(ATTR_HTTP_URL, resource.name);
      }
      if (this._semconvStability & SemconvStability.STABLE) {
        span.setAttribute(ATTR_URL_FULL, resource.name);
      }

      const skipOldSemconvContentLengthAttrs = !(
        this._semconvStability & SemconvStability.OLD
      );
      addSpanNetworkEvents(
        span,
        resource,
        this.getConfig().ignoreNetworkEvents,
        undefined,
        skipOldSemconvContentLengthAttrs
      );
      this._addCustomAttributesOnResourceSpan(
        span,
        resource,
        this.getConfig().applyCustomAttributesOnSpan?.resourceFetch
      );
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
        parentSpan ? trace.setSpan(context.active(), parentSpan) : undefined
      );
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
   * adds custom attributes to root span if configured
   */
  private _addCustomAttributesOnSpan(
    span: Span,
    applyCustomAttributesOnSpan: DocumentLoadCustomAttributeFunction | undefined
  ) {
    if (applyCustomAttributesOnSpan) {
      safeExecuteInTheMiddle(
        () => applyCustomAttributesOnSpan(span),
        error => {
          if (!error) {
            return;
          }

          this._diag.error('addCustomAttributesOnSpan', error);
        },
        true
      );
    }
  }

  /**
   * adds custom attributes to span if configured
   */
  private _addCustomAttributesOnResourceSpan(
    span: Span,
    resource: PerformanceResourceTiming,
    applyCustomAttributesOnSpan:
      | ResourceFetchCustomAttributeFunction
      | undefined
  ) {
    if (applyCustomAttributesOnSpan) {
      safeExecuteInTheMiddle(
        () => applyCustomAttributesOnSpan(span, resource),
        error => {
          if (!error) {
            return;
          }

          this._diag.error('addCustomAttributesOnResourceSpan', error);
        },
        true
      );
    }
  }

  /**
   * implements enable function
   */
  override enable() {
    // remove previously attached load to avoid adding the same event twice
    // in case of multiple enable calling.
    window.removeEventListener('load', this._onDocumentLoaded);
    this._waitForPageLoad();
  }

  /**
   * implements disable function
   */
  override disable() {
    window.removeEventListener('load', this._onDocumentLoaded);
  }
}
