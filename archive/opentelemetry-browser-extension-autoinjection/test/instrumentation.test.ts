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

/* eslint-disable node/no-unpublished-import */

import * as chromeMock from 'sinon-chrome';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { WebInstrumentation } from '../src/instrumentation/WebInstrumentation';
import {
  ExporterType,
  InstrumentationType,
  PlaceholderValues,
} from '../src/types';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { JSDOM } from 'jsdom';
import { TEST_URL } from './utils';

describe('WebInstrumentation', () => {
  let sandbox: sinon.SinonSandbox;
  let provider: WebTracerProvider;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    provider = new WebTracerProvider();
    const { window } = new JSDOM('<!doctype html><html><body></body></html>', {
      url: TEST_URL,
    });

    global.window = window as any;
    global.XMLHttpRequest = window.XMLHttpRequest;
    global.document = window.document;
  });

  afterEach(async () => {
    sandbox.restore();
    chromeMock.reset();
  });

  it('adds exporters to the trace provider', () => {
    const addSpanProcessorSpy = sinon.spy(provider, 'addSpanProcessor');
    const instrumentation = new WebInstrumentation(
      {
        exporters: {
          [ExporterType.CONSOLE]: {
            enabled: true,
          },
          [ExporterType.ZIPKIN]: {
            enabled: true,
            url: PlaceholderValues.ZIPKIN_URL,
          },
          [ExporterType.COLLECTOR_TRACE]: {
            enabled: true,
            url: PlaceholderValues.COLLECTOR_TRACE_URL,
          },
        },
        instrumentations: {
          [InstrumentationType.DOCUMENT_LOAD]: {
            enabled: true,
          },
          [InstrumentationType.FETCH]: {
            enabled: false,
          },
          [InstrumentationType.XML_HTTP_REQUEST]: {
            enabled: true,
          },
        },
        withZoneContextManager: true,
      },
      provider
    );
    instrumentation.register();
    assert.ok(addSpanProcessorSpy.callCount === 3);
  });
});
