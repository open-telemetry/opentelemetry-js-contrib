/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Span } from '@opentelemetry/api';
import type * as restify from 'restify';
import { LayerType } from './types';

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
