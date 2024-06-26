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

import { diag, TextMapPropagator } from '@opentelemetry/api';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { B3InjectEncoding, B3Propagator } from '@opentelemetry/propagator-b3';
import { JaegerPropagator } from '@opentelemetry/propagator-jaeger';
import { OTTracePropagator } from '@opentelemetry/propagator-ot-trace';
import { AWSXRayPropagator } from '@opentelemetry/propagator-aws-xray';
import { AWSXRayLambdaPropagator } from '@opentelemetry/propagator-aws-xray-lambda';

type PropagatorFactoryFunction = () => TextMapPropagator;

const propagatorMap = new Map<string, PropagatorFactoryFunction>([
  ['tracecontext', () => new W3CTraceContextPropagator()],
  ['baggage', () => new W3CTraceContextPropagator()],
  [
    'b3',
    () => new B3Propagator({ injectEncoding: B3InjectEncoding.SINGLE_HEADER }),
  ],
  [
    'b3multi',
    () => new B3Propagator({ injectEncoding: B3InjectEncoding.MULTI_HEADER }),
  ],
  ['jaeger', () => new JaegerPropagator()],
  ['xray', () => new AWSXRayPropagator()],
  ['xray-lambda', () => new AWSXRayLambdaPropagator()],
  ['ottrace', () => new OTTracePropagator()],
]);

/**
 * Get a propagator based on the OTEL_PROPAGATORS env var.
 */
export function getPropagator(): TextMapPropagator {
  if (
    process.env.OTEL_PROPAGATORS == null ||
    process.env.OTEL_PROPAGATORS.trim() === ''
  ) {
    return new CompositePropagator({
      propagators: [
        new W3CTraceContextPropagator(),
        new W3CBaggagePropagator(),
      ],
    });
  }

  const propagatorsFromEnv = Array.from(
    new Set(
      process.env.OTEL_PROPAGATORS?.split(',').map(value =>
        value.toLowerCase().trim()
      )
    )
  );

  const propagators = propagatorsFromEnv.flatMap(propagatorName => {
    if (propagatorName === 'none') {
      diag.info(
        'Not selecting any propagator for value "none" specified in the environment variable OTEL_PROPAGATORS'
      );
      return [];
    }

    const propagatorFactoryFunction = propagatorMap.get(propagatorName);
    if (propagatorFactoryFunction == null) {
      diag.error(
        `Invalid propagator "${propagatorName}" specified in the environment variable OTEL_PROPAGATORS`
      );
      return [];
    }
    return propagatorFactoryFunction();
  });

  return new CompositePropagator({ propagators });
}
