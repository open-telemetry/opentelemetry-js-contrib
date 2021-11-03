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

import { getFID, getLCP, getCLS, Metric } from 'web-vitals';
import { hrTime } from '@opentelemetry/core';
import {
  InstrumentationBase,
  InstrumentationConfig,
} from '@opentelemetry/instrumentation';
import { VERSION } from './version';

export interface WebVitalsInstrumentationConfig extends InstrumentationConfig {
  lcp?: {
    reportAllChanges: boolean;
  };
  cls?: {
    reportAllChanges: boolean;
  };
}

/**
 * This class represents a web vitals plugin
 */
export class WebVitalsInstrumentation extends InstrumentationBase {
  readonly component: string = 'web-vitals';
  readonly version: string = '1';
  moduleName = this.component;
  enabled: boolean | undefined;

  /**
   *
   * @param config
   */
  constructor(
    config: WebVitalsInstrumentationConfig & InstrumentationConfig = {}
  ) {
    super(
      '@opentelemetry/instrumentation-web-vitals',
      VERSION,
      Object.assign({}, config)
    );
  }

  private _getConfig(): WebVitalsInstrumentationConfig {
    return this._config;
  }

  init() {}

  report(name: string, metric: Metric, reportDeltas = false): void {
    if (this.enabled) {
      const value = metric.value;
      const now = hrTime();
      const span = this.tracer.startSpan('webvitals', { startTime: now });
      span.setAttribute(name, value);
      if (reportDeltas) {
        span.setAttribute(`${name}.delta`, metric.delta);
        span.setAttribute(`${name}.id`, metric.id);
      }
      span.end(now);
    }
  }
  /**
   * implements enable function
   */
  override enable(): void {
    if (this.enabled) {
      return;
    }
    this.enabled = true;
    getFID(metric => {
      this.report('fid', metric);
    });
    const clsReportAllChanges = this._getConfig().cls?.reportAllChanges;
    getCLS(metric => {
      this.report('cls', metric, clsReportAllChanges);
    }, clsReportAllChanges);

    const lcpReportAllChanges = this._getConfig().lcp?.reportAllChanges;
    getLCP(metric => {
      this.report('lcp', metric, lcpReportAllChanges);
    }, lcpReportAllChanges);
  }

  /**
   * implements disable function
   */
  override disable() {
    this.enabled = false;
  }
}
