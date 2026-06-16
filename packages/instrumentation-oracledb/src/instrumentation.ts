/*
 * Copyright The OpenTelemetry Authors
 * Copyright (c) 2025, Oracle and/or its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import type * as oracleDBTypes from 'oracledb';
import { OracleInstrumentationConfig } from './types';
import * as metrics from './metricUtils';
import { MeterProvider } from '@opentelemetry/api';
import { getOracleTelemetryTraceMetricHandlerClass } from './OracleTelemetryTraceMetricHandler';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

export class OracleInstrumentation extends InstrumentationBase {
  private _tmHandler: any;

  constructor(config: OracleInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    metrics._setMetricInstruments(this.meter);
  }

  override setMeterProvider(meterProvider: MeterProvider) {
    super.setMeterProvider(meterProvider);
  }

  protected override _updateMetricInstruments(): void {
    metrics._setMetricInstruments(this.meter)
  }

  protected init() {
    const moduleOracleDB = new InstrumentationNodeModuleDefinition(
      'oracledb',
      [">=6.0.0"],
      (moduleExports: typeof oracleDBTypes) => {
        if (!moduleExports) {
          return;
        }
        if (this._tmHandler) {
          // Already registered, so unregister it.
          (moduleExports as any).traceHandler.setTraceInstance();
          this._tmHandler = null;
        }
        const config = this.getConfig();
        const thClass = getOracleTelemetryTraceMetricHandlerClass(moduleExports);
        if (thClass) {
          const obj = new thClass(() => this.tracer, config);
          obj.enable();

          // Register the instance with oracledb.
          (moduleExports as any).traceHandler.setTraceInstance(obj);
          this._tmHandler = obj;
        }
        return moduleExports;
      },
      moduleExports => {
        if (this._tmHandler) {
          (moduleExports as any).traceHandler.setTraceInstance();
          this._tmHandler = null;
        }
      }
    );

    return [moduleOracleDB];
  }

  override setConfig(config: OracleInstrumentationConfig = {}) {
    super.setConfig(config);

    // update the config in OracleTelemetryTraceMetricHandler obj.
    this._tmHandler?.setInstrumentConfig(this._config);
  }
}
