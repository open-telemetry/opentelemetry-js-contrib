/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Context,
  TextMapPropagator,
  TextMapSetter,
  TextMapGetter,
  isSpanContextValid,
  defaultTextMapGetter,
  trace,
} from '@opentelemetry/api';
import {
  AWSXRayPropagator,
  AWSXRAY_TRACE_ID_HEADER,
} from '@opentelemetry/propagator-aws-xray';

export const AWSXRAY_TRACE_ID_ENV_VAR = '_X_AMZN_TRACE_ID';

/**
 * Implementation of the AWS X-Ray Trace Header propagation protocol with special
 * logic for handling Lambda X-ray environment variable.
 *
 * An example AWS Xray Tracing Header is shown below:
 * X-Amzn-Trace-Id: Root=1-5759e988-bd862e3fe1be46a994272793;Parent=53995c3f42cd8ad8;Sampled=1
 */
export class AWSXRayLambdaPropagator implements TextMapPropagator {
  private _awsXrayPropagator = new AWSXRayPropagator();

  public inject(context: Context, carrier: unknown, setter: TextMapSetter) {
    this._awsXrayPropagator.inject(context, carrier, setter);
  }

  public extract(
    context: Context,
    carrier: unknown,
    getter: TextMapGetter
  ): Context {
    const xrayContext = this._awsXrayPropagator.extract(
      context,
      carrier,
      getter
    );

    const spanContext = trace.getSpanContext(context);
    if (spanContext && isSpanContextValid(spanContext)) {
      return xrayContext;
    }

    const xrayEnvVar = process.env[AWSXRAY_TRACE_ID_ENV_VAR];
    if (!xrayEnvVar) {
      return xrayContext;
    }

    return this._awsXrayPropagator.extract(
      xrayContext,
      { [AWSXRAY_TRACE_ID_HEADER]: xrayEnvVar },
      defaultTextMapGetter
    );
  }

  public fields(): string[] {
    return this._awsXrayPropagator.fields();
  }
}
