/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Context, defaultTextMapSetter } from '@opentelemetry/api';
import {
  AWSXRAY_TRACE_ID_HEADER,
  AWSXRayPropagator,
} from '@opentelemetry/propagator-aws-xray';

/**
 * The header AWS services forward across hops that carry no message attributes
 * of their own - an S3 object notification, an EventBridge rule.
 */
export const AWS_TRACE_HEADER = 'X-Amzn-Trace-Id';

const xrayPropagator = new AWSXRayPropagator();

/**
 * The fields of the tracing header that carry the trace, and so are replaced.
 * Everything else on the header belongs to the platform.
 */
const OWNED_FIELDS = ['Root', 'Parent', 'Sampled'];

/**
 * The fields of a tracing header that belong to somebody else, ready to append
 * to the header replacing it.
 *
 * `Lineage` is how Lambda counts the hops of one triggering event; it stops
 * invoking a function after roughly sixteen in a chain through Lambda, S3, SQS
 * and SNS, so dropping it silently disables recursive loop detection. `Self` is
 * the trace id an Application Load Balancer stamps for the hop it handled.
 *
 * Unrecognised fields are carried too, which is the convention on this header -
 * an ALB documents that "an application can add arbitrary fields for its own
 * purposes. The load balancer preserves these fields but does not use them" -
 * and means a field AWS adds later needs no change here.
 */
export const carriedTraceHeaderFields = (
  header: string | undefined
): string[] =>
  (header ?? '')
    .split(';')
    .map(part => part.trim())
    .filter(
      part =>
        part.length > 0 &&
        !OWNED_FIELDS.some(field => part.startsWith(`${field}=`))
    );

/**
 * The tracing header to send for a context, or `undefined` when it holds no
 * valid span.
 *
 * `replacing` is the header already on the request, if any. It is not merged
 * into: `AWSXRayPropagator` builds a fresh `Root`/`Parent`/`Sampled` and knows
 * nothing of what was there, so the platform's fields are appended afterwards.
 */
export const traceHeaderFor = (
  context: Context,
  replacing: string | undefined
): string | undefined => {
  const carrier: Record<string, string> = {};
  xrayPropagator.inject(context, carrier, defaultTextMapSetter);
  const trace = carrier[AWSXRAY_TRACE_ID_HEADER];
  if (!trace) return undefined;
  return [trace, ...carriedTraceHeaderFields(replacing)].join(';');
};

/** Reads the tracing header from a header bag, whatever case it is in. */
export const existingTraceHeader = (
  headers: Record<string, string> | undefined
): string | undefined => {
  const name = Object.keys(headers ?? {}).find(
    header => header.toLowerCase() === AWSXRAY_TRACE_ID_HEADER
  );
  return name ? headers?.[name] : undefined;
};
