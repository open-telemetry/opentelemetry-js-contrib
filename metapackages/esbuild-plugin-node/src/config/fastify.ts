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
  FastifyInstrumentation,
  FastifyInstrumentationConfig,
} from '@opentelemetry/instrumentation-fastify';

import { InstrumentationConfig } from './types';

function getFastifyInstrumentationArgs(config?: FastifyInstrumentationConfig) {
  if (!config) return;

  return `{
    enabled: ${config.enabled ?? true},
    // TODO: Figure out a way to pass in functions correctly. Stringifying them like this means they can't depend
    // on any out of scope dependencies like imports
    requestHook: ${config.requestHook?.toString() ?? undefined},
  }`;
}

export const fastifyInstrumentations = new FastifyInstrumentation().init();

export const fastifyInstrumentationConfig: Record<
  'fastify',
  InstrumentationConfig<'@opentelemetry/instrumentation-fastify'>
> = {
  fastify: {
    oTelInstrumentationPackage: '@opentelemetry/instrumentation-fastify',
    oTelInstrumentationClass: 'FastifyInstrumentation',
    configGenerator: getFastifyInstrumentationArgs,
  },
};
