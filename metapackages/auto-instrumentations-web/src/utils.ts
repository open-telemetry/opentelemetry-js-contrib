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

import { diag } from '@opentelemetry/api';
import {Instrumentation, InstrumentationConfig} from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';

const InstrumentationMap = {
  '@opentelemetry/instrumentation-document-load': DocumentLoadInstrumentation,
  '@opentelemetry/instrumentation-fetch': FetchInstrumentation,
  '@opentelemetry/instrumentation-user-interaction':
    UserInteractionInstrumentation,
  '@opentelemetry/instrumentation-xml-http-request':
    XMLHttpRequestInstrumentation,
};

// Config types inferred automatically from the first argument of the constructor
type ConfigArg<T> = T extends new (...args: infer U) => unknown ? U[0] : never;
export type InstrumentationConfigMap = {
  [Name in keyof typeof InstrumentationMap]?: ConfigArg<
    (typeof InstrumentationMap)[Name]
  >;
};

export function getWebAutoInstrumentations(
  inputConfigs: InstrumentationConfigMap = {}
): Instrumentation[] {
  for (const name of Object.keys(inputConfigs)) {
    if (!Object.prototype.hasOwnProperty.call(InstrumentationMap, name)) {
      diag.error(`Provided instrumentation name "${name}" not found`);
      continue;
    }
  }

  const instrumentations: Instrumentation[] = [];

  for (const name of Object.keys(InstrumentationMap) as Array<
    keyof typeof InstrumentationMap
  >) {
    const Instance = InstrumentationMap[name];
    // Defaults are defined by the instrumentation itself
    const userConfig: InstrumentationConfig = inputConfigs[name] ?? {};

    if (userConfig.enabled === false) {
      diag.debug(`Disabling instrumentation for ${name}`);
      continue;
    }

    try {
      diag.debug(`Loading instrumentation for ${name}`);
      instrumentations.push(new Instance(userConfig));
    } catch (e: any) {
      diag.error(e);
    }
  }

  return instrumentations;
}
