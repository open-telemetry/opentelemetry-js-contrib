/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Span, Context as OtelContext } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { Context } from 'aws-lambda';

export type RequestHook = (
  span: Span,
  hookInfo: { event: any; context: Context }
) => void;

export type ResponseHook = (
  span: Span,
  hookInfo: {
    err?: Error | string | null;
    res?: any;
  }
) => void;

export type EventContextExtractor = (
  event: any,
  context: Context
) => OtelContext;
export interface AwsLambdaInstrumentationConfig extends InstrumentationConfig {
  requestHook?: RequestHook;
  responseHook?: ResponseHook;
  eventContextExtractor?: EventContextExtractor;
  lambdaHandler?: string;
  lambdaStartTime?: number;
}
