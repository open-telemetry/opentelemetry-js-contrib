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

import * as tracing from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

import * as assert from 'assert';
import * as sinon from 'sinon';
import { WebVitalsInstrumentation } from '../src';

const exporter = new tracing.InMemorySpanExporter();
const provider = new tracing.BasicTracerProvider();
const spanProcessor = new tracing.SimpleSpanProcessor(exporter);
let exportSpy: any;

provider.addSpanProcessor(spanProcessor);
provider.register();

class DummySpanExporter implements tracing.SpanExporter {
  export(spans: any) {}

  shutdown() {
    return Promise.resolve();
  }
}

describe('Web vitals Instrumentation', () => {
  beforeEach(() => {
    const conf = { enabled: false };
    const webVitalsInstrumentation = new WebVitalsInstrumentation(conf);
    const webTracerProvider = new WebTracerProvider();

    const dummySpanExporter = new DummySpanExporter();
    exportSpy = sinon.stub(dummySpanExporter, 'export');
    webTracerProvider.addSpanProcessor(
      new tracing.SimpleSpanProcessor(dummySpanExporter)
    );

    registerInstrumentations({
      tracerProvider: webTracerProvider,
      instrumentations: [webVitalsInstrumentation],
    });
  });

  it('should capture lcp and cls', done => {
    document.body.appendChild(document.createTextNode("Don't shift me!"));

    // tests very flaky without those weird timeouts
    setTimeout(() => {
      document.body.insertBefore(
        document.createTextNode('CLSandLCPForcingNode'),
        document.body.firstChild
      );

      setTimeout(() => {
        // CLS is sent on page hide
        Object.defineProperty(document, 'visibilityState', {
          value: 'hidden',
          configurable: true,
        });
        window.dispatchEvent(new Event('visibilitychange'));
        const cls = exportSpy.args.find((el: any) => {
          return el[0][0].attributes.cls !== undefined;
        });

        assert.ok(cls, 'CLS span not found');
        assert.ok(cls[0][0].attributes.cls > 0, 'CLS is 0');

        const lcp = exportSpy.args.find((el: any) => {
          return el[0][0].attributes.lcp !== undefined;
        });

        assert.ok(lcp, 'LCP span not found');
        assert.ok(lcp[0][0].attributes.lcp > 0, 'LCP is 0');

        done();
      }, 100);
    }, 100);
  });
});
