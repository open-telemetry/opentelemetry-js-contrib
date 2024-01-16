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

type _RemoveFunctions<T> = {
  [P in keyof T as T[P] extends (...args: any) => any ? never : P]: T[P];
};

// _RemoveFunctions does not work on optional fields, so first make the type required then apply Partial to the result
export type RemoveFunctions<T> = Partial<_RemoveFunctions<Required<T>>>;

type BuiltinPackages =
  | '@opentelemetry/instrumentation-dns'
  | '@opentelemetry/instrumentation-fs'
  | '@opentelemetry/instrumentation-http';

type NonBuiltinInstrumentationConfigMap = Omit<
  InstrumentationConfigMap,
  BuiltinPackages
>;

// TODO: Remove builtins from this
export type EsbuildInstrumentationConfigMap = {
  [K in keyof NonBuiltinInstrumentationConfigMap]: RemoveFunctions<
    NonBuiltinInstrumentationConfigMap[K]
  >;
};

export interface OpenTelemetryPluginParams {
  instrumentationConfig?: EsbuildInstrumentationConfigMap;

  /** Modules to consider external and ignore from the plugin */
  externalModules?: string[];

  /**
   * Path prefixes to ignore.
   *
   * ie if you configure compilerOptions.paths in your tsconfig.json to use something like `~/` for the
   * root of your project then you could set that here to ignore modules
   */
  pathPrefixesToIgnore?: string[];
}
