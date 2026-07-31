/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventLoopUtilization, performance } from 'node:perf_hooks';
import { Meter } from '@opentelemetry/api';
import { BaseCollector } from './baseCollector';
import {
  METRIC_NODEJS_EVENTLOOP_TIME,
  ATTR_NODEJS_EVENTLOOP_STATE,
  NODEJS_EVENTLOOP_STATE_VALUE_ACTIVE,
  NODEJS_EVENTLOOP_STATE_VALUE_IDLE,
} from '../semconv';

const { eventLoopUtilization: eventLoopUtilizationCollector } = performance;

export class EventLoopTimeCollector extends BaseCollector {
  public updateMetricInstruments(meter: Meter): void {
    const timeCounter = meter.createObservableCounter(
      METRIC_NODEJS_EVENTLOOP_TIME,
      {
        description:
          'Cumulative duration of time the event loop has been in each state.',
        unit: 's',
      }
    );

    meter.addBatchObservableCallback(
      async observableResult => {
        if (!this._config.enabled) return;

        const data = this.scrape();
        if (data === undefined) return;

        observableResult.observe(timeCounter, data.active / 1000, {
          [ATTR_NODEJS_EVENTLOOP_STATE]: NODEJS_EVENTLOOP_STATE_VALUE_ACTIVE,
        });
        observableResult.observe(timeCounter, data.idle / 1000, {
          [ATTR_NODEJS_EVENTLOOP_STATE]: NODEJS_EVENTLOOP_STATE_VALUE_IDLE,
        });
      },
      [timeCounter]
    );
  }

  protected internalDisable(): void {}

  protected internalEnable(): void {}

  private scrape(): EventLoopUtilization {
    return eventLoopUtilizationCollector();
  }
}
