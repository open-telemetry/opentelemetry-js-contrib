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

import { awsSdkInstrumentationConfig, awsSdkInstrumentations } from './aws-sdk';
import {
  fastifyInstrumentationConfig,
  fastifyInstrumentations,
} from './fastify';
import { pinoInstrumentationConfig, pinoInstrumentations } from './pino';

import { InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';

export const instrumentations: InstrumentationNodeModuleDefinition<unknown>[] =
  [
    ...fastifyInstrumentations,
    ...pinoInstrumentations,
    ...awsSdkInstrumentations,
  ];

export const otelPackageToInstrumentationConfig = {
  ...pinoInstrumentationConfig,
  ...fastifyInstrumentationConfig,
  ...awsSdkInstrumentationConfig,
};
