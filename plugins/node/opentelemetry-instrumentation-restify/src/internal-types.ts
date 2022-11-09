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
import type * as restify from 'restify';

export enum LayerType {
  MIDDLEWARE = 'middleware',
  REQUEST_HANDLER = 'request_handler',
}

declare interface RequestWithRoute extends restify.Request {
  route: { path: string };
  getRoute: () => { path: string };
}

export declare type Request = RequestWithRoute;
export declare type Metadata = {
  path?: string;
  methodName?: string;
  type: LayerType;
};

export type NestedRequestHandlers = Array<
  NestedRequestHandlers | restify.RequestHandler
>;

/**
 * extends opentelemetry/api Span object to instrument the root span name of http instrumentation
 */
export interface InstrumentationSpan extends Span {
  name?: string;
}
