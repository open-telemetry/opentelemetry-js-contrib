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

import { Span } from '@opentelemetry/api';
import type { FastifyReply } from 'fastify';
import { spanRequestSymbol } from './constants';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { FastifyRequest } from 'fastify/types/request';

export type HandlerOriginal = (() => Promise<unknown>) & (() => void);

export type PluginFastifyReply = FastifyReply & {
  [spanRequestSymbol]?: Span[];
};

/**
 * Function that can be used to add custom attributes to the current span
 * @param span - The Fastify layer span.
 * @param request - The Fastify request object.
 */
export interface FastifyCustomAttributeFunction {
  (span: Span, request: FastifyRequest): void;
}

/**
 * Options available for the Fastify Instrumentation
 */
export interface FastifyInstrumentationConfig extends InstrumentationConfig {
  /** Function for adding custom attributes to each layer span */
  requestHook?: FastifyCustomAttributeFunction;
}
