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

import { addTracerToHandlers } from "../src/instrumentationUtils";
import { OpenTelemetryCallbackHandler } from "../src/callback-handler";
import { Tracer } from "@opentelemetry/api";

describe("addTracerToHandlers", () => {
  it("should add a tracer if there are no handlers", () => {
    const tracer = {} as Tracer;

    const result = addTracerToHandlers(tracer);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    if (Array.isArray(result)) {
      expect(result[0]).toBeInstanceOf(OpenTelemetryCallbackHandler);
    }
  });

  it("should add a handler to a pre-existing array of handlers", () => {
    const tracer = {} as Tracer;
    const handlers = [{}];

    const result = addTracerToHandlers(tracer, handlers);

    expect(result).toBe(handlers);
    expect(result).toHaveLength(2);
    if (Array.isArray(result)) {
      expect(result[1]).toBeInstanceOf(OpenTelemetryCallbackHandler);
    }
  });

  it("should not add a handler if it already exists in an array of handlers", () => {
    const tracer = {} as Tracer;
    const callbackHandler = new OpenTelemetryCallbackHandler(tracer);
    const handlers = [callbackHandler];

    const result = addTracerToHandlers(tracer, handlers);

    expect(result).toBe(handlers);
    expect(result).toHaveLength(1);
    if (Array.isArray(result)) {
      expect(result[0]).toBeInstanceOf(OpenTelemetryCallbackHandler);
    }
  });
});