/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { getInstrumentation } from './instrumentation-singleton';
import { registerInstrumentationTestingProvider } from './otel-default-provider';
import { resetMemoryExporter } from './otel-provider-api';

export {
  getInstrumentation,
  registerInstrumentationTesting,
} from './instrumentation-singleton';
export {
  getTestMemoryExporter,
  getTestSpans,
  resetMemoryExporter,
  setTestMemoryExporter,
} from './otel-provider-api';
export { registerInstrumentationTestingProvider } from './otel-default-provider';

export const mochaHooks = {
  beforeAll(done: Function) {
    // since we run mocha executable, process.argv[1] will look like this:
    // ${root instrumentation package path}/node_modules/.bin/mocha
    // this is not very robust, might need to refactor in the future
    let serviceName = 'unknown_instrumentation';
    if (process.env.OTEL_SERVICE_NAME) {
      serviceName = process.env.OTEL_SERVICE_NAME;
    } else {
      try {
        serviceName = require(process.argv[1] + '/../../../package.json').name;
      } catch {
        // could not determine serviceName, continue regardless of this
      }
    }
    const provider = registerInstrumentationTestingProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: serviceName,
      }),
    });
    getInstrumentation()?.setTracerProvider(provider);
    done();
  },

  beforeEach(done: Function) {
    resetMemoryExporter();
    // reset the config before each test, so that we don't leak state from one test to another
    getInstrumentation()?.setConfig({});
    done();
  },
};
