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
import { Span, SpanAttributes, SpanKind, Tracer } from '@opentelemetry/api';
import {
  AwsSdkInstrumentationConfig,
  NormalizedRequest,
  NormalizedResponse,
} from '../types';

export interface RequestMetadata {
  // isIncoming - if true, then the operation callback / promise should be bind with the operation's span
  isIncoming: boolean;
  spanAttributes?: SpanAttributes;
  spanKind?: SpanKind;
  spanName?: string;
}

export interface ServiceExtension {
  // called before request is sent, and before span is started
  requestPreSpanHook: (request: NormalizedRequest, config: AwsSdkInstrumentationConfig) => RequestMetadata;

  // called before request is sent, and after span is started
  requestPostSpanHook?: (request: NormalizedRequest) => void;

  responseHook?: (
    response: NormalizedResponse,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig
  ) => void;
}
