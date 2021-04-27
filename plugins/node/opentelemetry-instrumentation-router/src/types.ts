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
import * as http from 'http';
import { Span } from '@opentelemetry/api';

export enum LayerType {
  MIDDLEWARE = 'middleware',
  REQUEST_HANDLER = 'request_handler',
}
export interface RouterIncomingMessage extends http.IncomingMessage {
  baseUrl: string;
  route?: {
    path: string;
  };
}
export type Next = (...args: any[]) => void;
export interface Layer {
  handle: Function;
  method?: string;
  handle_request: (
    req: RouterIncomingMessage,
    res: http.ServerResponse,
    next: Next
  ) => void;
  handle_error: (
    error: Error,
    req: RouterIncomingMessage,
    res: http.ServerResponse,
    next: Next
  ) => void;
}

export enum CustomAttributeNames {
  TYPE = 'router.type',
  NAME = 'router.name',
  METHOD = 'router.method',
  VERSION = 'router.version',
}

/**
 * extends opentelemetry/api Span object to instrument the root span name of http instrumentation
 */
export interface InstrumentationSpan extends Span {
  name?: string;
}
