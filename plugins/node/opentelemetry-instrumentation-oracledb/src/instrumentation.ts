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
 *
 * Copyright (c) 2024, Oracle and/or its affiliates.
 * */
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import type * as oracleDBTypes from 'oracledb';
import { OracleInstrumentationConfig } from './types';
import * as utils from './utils';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

export class OracleInstrumentation extends InstrumentationBase {
  private _tmHandler!: utils.OracleTelemetryTraceHandler | null;

  constructor(config: OracleInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  protected init() {
    const moduleOracleDB = new InstrumentationNodeModuleDefinition(
      'oracledb',
      ['>= 6.7 < 9.*'],
      (moduleExports: typeof oracleDBTypes) => {
        const newmoduleExports: any = moduleExports;
        const config = this.getConfig();
        const obj = new utils.OracleTelemetryTraceHandler(this.tracer, config);
        obj.enable();

        // Register the instance with oracledb.
        newmoduleExports.traceHandler.setTraceInstance(obj);
        this._tmHandler = obj;
        return moduleExports;
      },
      moduleExports => {
        const newmoduleExports: any = moduleExports;
        newmoduleExports.traceHandler.setTraceInstance();
        this._tmHandler = null;
      }
    );

    return [moduleOracleDB];
  }

  override setConfig(config: OracleInstrumentationConfig = {}) {
    super.setConfig(config);

    // update the config in OracleTelemetryTraceHandler obj.
    this._tmHandler?.setInstrumentConfig(this._config);
  }
}
