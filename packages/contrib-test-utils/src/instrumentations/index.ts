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

import { resourceFromAttributes } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
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
        [SEMRESATTRS_SERVICE_NAME]: serviceName,
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
