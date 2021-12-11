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

import { hrTime } from '@opentelemetry/core';
import {
  InstrumentationBase,
  InstrumentationConfig,
} from '@opentelemetry/instrumentation';
import { VERSION } from './version';

// Currently missing in typescript DOM definitions
interface PerformanceLongTaskTiming extends PerformanceEntry {
  attribution: TaskAttributionTiming[];
}

interface TaskAttributionTiming extends PerformanceEntry {
  containerType: string;
  containerSrc: string;
  containerId: string;
  containerName: string;
}

const LONGTASK_PERFORMANCE_TYPE = 'longtask';

export class LongTaskInstrumentation extends InstrumentationBase {
  readonly component: string = 'long-task';
  readonly version: string = VERSION;
  moduleName = this.component;

  private _observer?: PerformanceObserver;

  /**
   *
   * @param config
   */
  constructor(config: InstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-long-task', VERSION, config);
  }

  init() {}

  private isSupported() {
    if (
      typeof PerformanceObserver === 'undefined' ||
      !PerformanceObserver.supportedEntryTypes
    ) {
      return false;
    }

    return PerformanceObserver.supportedEntryTypes.includes(
      LONGTASK_PERFORMANCE_TYPE
    );
  }

  private _createSpanFromEntry(entry: PerformanceLongTaskTiming) {
    const span = this.tracer.startSpan(LONGTASK_PERFORMANCE_TYPE, {
      startTime: hrTime(entry.startTime),
    });
    span.setAttribute('component', this.component);
    span.setAttribute('longtask.name', entry.name);
    span.setAttribute('longtask.entry_type', entry.entryType);
    span.setAttribute('longtask.duration', entry.duration);

    if (Array.isArray(entry.attribution)) {
      entry.attribution.forEach((attribution, index) => {
        const prefix =
          entry.attribution.length > 1
            ? `longtask.attribution[${index}]`
            : 'longtask.attribution';
        span.setAttribute(`${prefix}.name`, attribution.name);
        span.setAttribute(`${prefix}.entry_type`, attribution.entryType);
        span.setAttribute(`${prefix}.start_time`, attribution.startTime);
        span.setAttribute(`${prefix}.duration`, attribution.duration);
        span.setAttribute(
          `${prefix}.container_type`,
          attribution.containerType
        );
        span.setAttribute(`${prefix}.container_src`, attribution.containerSrc);
        span.setAttribute(`${prefix}.container_id`, attribution.containerId);
        span.setAttribute(
          `${prefix}.container_name`,
          attribution.containerName
        );
      });
    }

    span.end(hrTime(entry.startTime + entry.duration));
  }

  override enable() {
    if (!this.isSupported()) {
      this._diag.debug('Environment not supported');
      return;
    }

    if (this._observer) {
      // Already enabled
      return;
    }

    this._observer = new PerformanceObserver(list => {
      list
        .getEntries()
        .forEach(entry =>
          this._createSpanFromEntry(entry as PerformanceLongTaskTiming)
        );
    });
    this._observer.observe({
      type: LONGTASK_PERFORMANCE_TYPE,
      buffered: true,
    });
  }

  override disable() {
    if (!this._observer) {
      return;
    }

    this._observer.disconnect();
    this._observer = undefined;
  }
}
