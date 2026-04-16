/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { MetricCollector } from '../types/metricCollector';
import { Meter } from '@opentelemetry/api';
import { RuntimeNodeInstrumentationConfig } from '../types';

export abstract class BaseCollector implements MetricCollector {
  protected _config: RuntimeNodeInstrumentationConfig = {};

  constructor(config: RuntimeNodeInstrumentationConfig = {}) {
    this._config = config;
  }

  public disable(): void {
    this._config.enabled = false;
    this.internalDisable();
  }

  public enable(): void {
    this._config.enabled = true;
    this.internalEnable();
  }

  public abstract updateMetricInstruments(meter: Meter): void;

  protected abstract internalEnable(): void;

  protected abstract internalDisable(): void;
}
