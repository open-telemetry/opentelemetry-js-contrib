/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { diag } from '@opentelemetry/api';
import { XMLHttpRequestInstrumentationConfig } from '@opentelemetry/instrumentation-xml-http-request';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { getWebAutoInstrumentations } from '../src';

describe('utils', () => {
  describe('getWebAutoInstrumentations', () => {
    it('should load default instrumentations', () => {
      const instrumentations = getWebAutoInstrumentations();
      const expectedInstrumentations = [
        '@opentelemetry/instrumentation-document-load',
        '@opentelemetry/instrumentation-fetch',
        '@opentelemetry/instrumentation-user-interaction',
        '@opentelemetry/instrumentation-xml-http-request',
      ];
      assert.strictEqual(instrumentations.length, 4);
      for (let i = 0, j = instrumentations.length; i < j; i++) {
        assert.strictEqual(
          instrumentations[i].instrumentationName,
          expectedInstrumentations[i],
          `Instrumentation ${expectedInstrumentations[i]}, not loaded`
        );
      }
    });

    it('should use user config', () => {
      const clearTimingResources = true;

      const instrumentations = getWebAutoInstrumentations({
        '@opentelemetry/instrumentation-xml-http-request': {
          clearTimingResources,
        },
      });
      const instrumentation = instrumentations.find(
        instr =>
          instr.instrumentationName ===
          '@opentelemetry/instrumentation-xml-http-request'
      ) as any;
      const config =
        instrumentation._config as XMLHttpRequestInstrumentationConfig;

      assert.strictEqual(config.clearTimingResources, clearTimingResources);
    });

    it('should not return disabled instrumentation', () => {
      const instrumentations = getWebAutoInstrumentations({
        '@opentelemetry/instrumentation-xml-http-request': {
          enabled: false,
        },
      });
      const instrumentation = instrumentations.find(
        instr =>
          instr.instrumentationName ===
          '@opentelemetry/instrumentation-xml-http-request'
      );
      assert.strictEqual(instrumentation, undefined);
    });

    it('should show error for none existing instrumentation', () => {
      const spy = sinon.stub(diag, 'error');
      const name = '@opentelemetry/instrumentation-http2';
      const instrumentations = getWebAutoInstrumentations({
        // @ts-expect-error verify that wrong name works
        [name]: {
          enabled: false,
        },
      });
      const instrumentation = instrumentations.find(
        instr => instr.instrumentationName === name
      );
      assert.strictEqual(instrumentation, undefined);

      assert.strictEqual(
        spy.args[0][0],
        `Provided instrumentation name "${name}" not found`
      );
    });
  });
});
