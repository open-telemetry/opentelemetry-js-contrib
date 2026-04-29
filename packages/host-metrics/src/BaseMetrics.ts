/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Meter, MeterProvider, metrics } from '@opentelemetry/api';

/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

/**
 * Metrics Collector Configuration
 */
export interface MetricsCollectorConfig {
  // Meter Provider
  meterProvider?: MeterProvider;
  // Name of component
  name?: string;
  metricGroups?: string[];
}

const DEFAULT_NAME = PACKAGE_NAME;

/**
 * Base Class for metrics
 */
export abstract class BaseMetrics {
  protected _meter: Meter;
  private _name: string;
  protected _metricGroups: Array<string> | undefined;

  constructor(config?: MetricsCollectorConfig) {
    // Do not use `??` operator to allow falling back to default when the
    // specified name is an empty string.
    this._name = config?.name || DEFAULT_NAME;
    const meterProvider = config?.meterProvider ?? metrics.getMeterProvider();
    this._meter = meterProvider.getMeter(this._name, PACKAGE_VERSION);
    this._metricGroups = config?.metricGroups;
  }

  /**
   * Creates metrics
   */
  protected abstract _createMetrics(): void;

  /**
   * Starts collecting stats
   */
  public abstract start(): void;
}
