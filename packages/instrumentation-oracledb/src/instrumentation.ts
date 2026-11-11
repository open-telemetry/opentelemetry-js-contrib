/*
 * Copyright The OpenTelemetry Authors
 * Copyright (c) 2025, 2026, Oracle and/or its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import type * as oracleDBTypes from 'oracledb';
import type { OracleInstrumentationConfig } from './types';
import { setMetricInstruments } from './metricUtils';
import { getOracleTelemetryTraceHandlerClass } from './OracleTelemetryTraceHandler';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

// When oracledb is loaded with an ESM `import`, the hook passes the module
// namespace object. oracledb is CommonJS, so its exports (including
// `traceHandler`) are on the namespace's `default` property.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractModuleExports(module: any) {
  return module[Symbol.toStringTag] === 'Module'
    ? module.default // ESM
    : module; // CommonJS
}

export class OracleInstrumentation extends InstrumentationBase {
  private _tmHandler: any;

  constructor(config: OracleInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  override _updateMetricInstruments(): void {
    setMetricInstruments(this.meter);
  }

  protected init() {
    const moduleOracleDB = new InstrumentationNodeModuleDefinition(
      'oracledb',
      ['>= 6.7 < 27'],
      (moduleExports: typeof oracleDBTypes) => {
        if (!moduleExports) {
          return;
        }
        const oracledb = extractModuleExports(moduleExports);
        if (this._tmHandler) {
          // Already registered, so unregister it.
          oracledb.traceHandler.setTraceInstance();
          this._tmHandler = null;
        }
        const config = this.getConfig();
        const thClass = getOracleTelemetryTraceHandlerClass(oracledb);
        if (thClass) {
          const obj = new thClass(() => this.tracer, config);
          obj.enable();

          // Register the instance with oracledb.
          oracledb.traceHandler.setTraceInstance(obj);
          this._tmHandler = obj;
        }
        return moduleExports;
      },
      moduleExports => {
        if (this._tmHandler) {
          extractModuleExports(moduleExports).traceHandler.setTraceInstance();
          this._tmHandler = null;
        }
      }
    );

    return [moduleOracleDB];
  }

  override setConfig(config: OracleInstrumentationConfig = {}) {
    super.setConfig(config);
    this._tmHandler?.setInstrumentConfig(this._config);
  }
}
