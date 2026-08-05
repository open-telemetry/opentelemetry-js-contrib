/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventLoopUtilization, performance } from 'node:perf_hooks';
import { Meter } from '@opentelemetry/api';
import { BaseCollector } from './baseCollector';
import { METRIC_NODEJS_EVENTLOOP_UTILIZATION } from '../semconv';

const { eventLoopUtilization: eventLoopUtilizationCollector } = performance;

export class EventLoopUtilizationCollector extends BaseCollector {
  // Value needs to be initialized the first time otherwise the first measurement would always be 1
  // See https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3118#issuecomment-3429737955
  private _lastValue: EventLoopUtilization = eventLoopUtilizationCollector();

  public updateMetricInstruments(meter: Meter): void {
    meter
      .createObservableGauge(METRIC_NODEJS_EVENTLOOP_UTILIZATION, {
        description: 'Event loop utilization',
        unit: '1',
      })
      .addCallback(async observableResult => {
        if (!this._config.enabled) return;

        const currentELU = eventLoopUtilizationCollector();
        const deltaELU = eventLoopUtilizationCollector(
          currentELU,
          this._lastValue
        );
        this._lastValue = currentELU;
        observableResult.observe(deltaELU.utilization);
      });
  }

  protected internalDisable(): void {}

  protected internalEnable(): void {}
}
