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

import { LangChainInstrumentation } from '../src';
import { expect } from 'expect';

describe('LangChainInstrumentation', () => {
  describe('constructor', () => {
    it('should create an instance', () => {
      const instrumentation = new LangChainInstrumentation();
      expect(instrumentation).toBeInstanceOf(LangChainInstrumentation);
    });

    it('should have correct instrumentationName', () => {
      const instrumentation = new LangChainInstrumentation();
      expect(instrumentation.instrumentationName).toBe(
        '@opentelemetry/instrumentation-langchain'
      );
    });
  });

  describe('setConfig', () => {
    it('should normalize captureMessageContent config', () => {
      const instrumentation = new LangChainInstrumentation({
        captureMessageContent: true,
      });
      const config = instrumentation.getConfig();
      expect(config.captureMessageContent).toBe(true);
    });

    it('should default captureMessageContent to false', () => {
      const instrumentation = new LangChainInstrumentation();
      const config = instrumentation.getConfig();
      expect(config.captureMessageContent).toBe(false);
    });
  });
});
