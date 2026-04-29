/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LangChainInstrumentation } from '../src';
import { expect } from 'expect';

describe('LangChainInstrumentation', () => {
  let instrumentation: LangChainInstrumentation;

  beforeEach(() => {
    instrumentation = new LangChainInstrumentation();
  });

  afterEach(() => {
    instrumentation.disable();
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(instrumentation).toBeInstanceOf(LangChainInstrumentation);
    });

    it('should have correct instrumentationName', () => {
      expect(instrumentation.instrumentationName).toBe(
        '@opentelemetry/instrumentation-langchain'
      );
    });
  });

  describe('setConfig', () => {
    it('should normalize captureMessageContent config', () => {
      const instr = new LangChainInstrumentation({
        captureMessageContent: true,
      });
      const config = instr.getConfig();
      expect(config.captureMessageContent).toBe(true);
      instr.disable();
    });

    it('should default captureMessageContent to false', () => {
      const config = instrumentation.getConfig();
      expect(config.captureMessageContent).toBe(false);
    });
  });
});
