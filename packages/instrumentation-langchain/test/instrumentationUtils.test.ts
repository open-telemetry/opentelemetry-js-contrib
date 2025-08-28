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

import { addTracerToHandlers } from '../src/instrumentationUtils';
import { OpenTelemetryCallbackHandler } from '../src/callback-handler';
import { Tracer } from '@opentelemetry/api';
import { expect } from 'chai';
import * as sinon from 'sinon';

describe('addTracerToHandlers', () => {
  it('should add a tracer if there are no handlers', () => {
    const tracer = {} as Tracer;

    const result = addTracerToHandlers(tracer);

    // First check if result is array-like
    expect(Array.isArray(result) || 'handlers' in result).to.be.true;

    // Safely check the result
    if (Array.isArray(result)) {
      expect(result.length).to.equal(1);
      expect(result[0]).to.be.instanceOf(OpenTelemetryCallbackHandler);
    } else if ('handlers' in result && Array.isArray(result.handlers)) {
      expect(result.handlers.length).to.equal(1);
      expect(result.handlers[0]).to.be.instanceOf(OpenTelemetryCallbackHandler);
    }
  });

  it('should add a handler to a pre-existing array of handlers', () => {
    const tracer = {} as Tracer;
    const handlers = [{}];

    const result = addTracerToHandlers(tracer, handlers);

    expect(result).to.equal(handlers);

    // Use type guard before checking length
    if (Array.isArray(result)) {
      expect(result.length).to.equal(2);
      expect(result[1]).to.be.instanceOf(OpenTelemetryCallbackHandler);
    }
  });

  it('should not add a handler if it already exists in an array of handlers', () => {
    const tracer = {} as Tracer;
    const callbackHandler = new OpenTelemetryCallbackHandler(tracer);
    const handlers = [callbackHandler];

    const result = addTracerToHandlers(tracer, handlers);

    expect(result).to.equal(handlers);

    // Use type guard before checking length
    if (Array.isArray(result)) {
      expect(result.length).to.equal(1);
      expect(result[0]).to.be.instanceOf(OpenTelemetryCallbackHandler);
    }
  });
});
