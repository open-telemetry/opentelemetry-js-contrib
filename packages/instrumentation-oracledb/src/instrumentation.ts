/*
 * Copyright The OpenTelemetry Authors
 * Copyright (c) 2025, Oracle and/or its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import type * as oracleDBTypes from 'oracledb';
import { OracleInstrumentationConfig } from './types';
import { getOracleTelemetryTraceHandlerClass } from './OracleTelemetryTraceHandler';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

export class OracleInstrumentation extends InstrumentationBase {
  private _tmHandler: any;
  private _dbSemconvStability!: SemconvStability;

  constructor(config: OracleInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    this._setSemconvStability();
  }

  private _setSemconvStability() {
    // Semconv mode follows the public process-level opt-in contract and is
    // resolved once at construction time from the environment.
    this._dbSemconvStability = semconvStabilityFromStr(
      'database',
      process.env.OTEL_SEMCONV_STABILITY_OPT_IN
    );
  }

  protected init() {
    const moduleOracleDB = new InstrumentationNodeModuleDefinition(
      'oracledb',
      ['>= 6.7 < 8'],
      (moduleExports: typeof oracleDBTypes) => {
        if (!moduleExports) {
          return;
        }
        if (this._tmHandler) {
          // Already registered, so unregister it.
          (moduleExports as any).traceHandler.setTraceInstance();
          this._tmHandler = null;
        }
        const config = {
          ...this.getConfig(),
          dbSemconvStability: this._dbSemconvStability,
        };
        const thClass = getOracleTelemetryTraceHandlerClass(moduleExports);
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

    // Semconv mode is resolved at construction time and is not mutated by
    // runtime config updates.
    this._tmHandler?.setInstrumentConfig({
      ...this._config,
      dbSemconvStability: this._dbSemconvStability,
    });
  }
}
