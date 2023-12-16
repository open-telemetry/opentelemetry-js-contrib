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

import type { OnLoadArgs as EsbuildOnLoadArgs } from 'esbuild';
import type { InstrumentationConfigMap } from '@opentelemetry/auto-instrumentations-node';

export type InstrumentedPackage =
  | 'fastify'
  | 'pino'
  | '@smithy/smithy-client'
  | '@smithy/middleware-stack';

export type OnLoadArgs = Omit<EsbuildOnLoadArgs, 'pluginData'> & {
  pluginData?: {
    shouldPatchPackage: boolean;
    package: InstrumentedPackage;
    instrumentation: {
      name: InstrumentedPackage;
    };
  };
};

export interface ModuleParams {
  oTelInstrumentationPackage: string;
  oTelInstrumentationClass: string;
  oTelInstrumentationConstructorArgs?: string;
  instrumentationName?: string;
}

export interface OpenTelemetryPluginParams {
  instrumentationConfig?: InstrumentationConfigMap;

  /** Modules to consider external and ignore from the plugin */
  externalModules?: string[];

  /**
   * Path prefixes to ignore.
   *
   * ie if you configure compilteOptions.paths in your tsconfig.json to use something like `~/` for the
   * root of your project then you could set that here to ignore modules
   */
  pathPrefixesToIgnore?: string[];
}
