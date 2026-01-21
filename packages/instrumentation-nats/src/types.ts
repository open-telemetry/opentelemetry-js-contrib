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
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { Span } from '@opentelemetry/api';
import type { Msg } from 'nats';

/**
 * Hook function called after a message is published.
 */
export type PublishHook = (span: Span, info: PublishInfo) => void;

/**
 * Hook function called after a message is received/processed.
 */
export type ConsumeHook = (span: Span, info: ConsumeInfo) => void;

export interface PublishInfo {
  subject: string;
  data?: Uint8Array | string;
}

export interface ConsumeInfo {
  message: Msg;
}

export interface NatsInstrumentationConfig extends InstrumentationConfig {
  publishHook?: PublishHook;

  consumeHook?: ConsumeHook;
  /**
   * Whether to include message body size in span attributes.
   * This is opt-in per OpenTelemetry semantic conventions.
   *
   * @default false
   */
  includeMessageBodySize?: boolean;
}
