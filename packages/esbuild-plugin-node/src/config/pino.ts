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

import {
  PinoInstrumentation,
  PinoInstrumentationConfig,
} from '@opentelemetry/instrumentation-pino';

import { InstrumentationConfig } from './types';
import { InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { RemoveFunctions } from '../types';

function getPinoInstrumentationArgs(
  config?: RemoveFunctions<PinoInstrumentationConfig>
) {
  if (!config) return;

  return `{
    enabled: ${config.enabled ?? true}
  }`;
}

export const pinoInstrumentations: InstrumentationNodeModuleDefinition<any>[] =
  new PinoInstrumentation().init();

export const pinoInstrumentationConfig: Record<
  'pino',
  InstrumentationConfig<'@opentelemetry/instrumentation-pino'>
> = {
  pino: {
    oTelInstrumentationPackage: '@opentelemetry/instrumentation-pino',
    oTelInstrumentationClass: 'PinoInstrumentation',
    configGenerator: getPinoInstrumentationArgs,
  },
};
