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

import { diag } from '@opentelemetry/api';
import { HttpInstrumentationConfig } from '@opentelemetry/instrumentation-http';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { getNodeAutoInstrumentations } from '../src';
import { getPropagator, getResourceDetectorsFromEnv } from '../src/utils';

describe('utils', () => {
  describe('getNodeAutoInstrumentations', () => {
    it('should include all installed instrumentations', () => {
      const instrumentations = getNodeAutoInstrumentations();
      const installedInstrumentations = Object.keys(
        require('../package.json').dependencies
      ).filter(depName => {
        return depName.startsWith('@opentelemetry/instrumentation-');
      });

      assert.deepStrictEqual(
        new Set(instrumentations.map(i => i.instrumentationName)),
        new Set(installedInstrumentations)
      );
    });

    it('should use user config', () => {
      function applyCustomAttributesOnSpan() {}

      const instrumentations = getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          applyCustomAttributesOnSpan,
        },
      });
      const instrumentation = instrumentations.find(
        instr =>
          instr.instrumentationName === '@opentelemetry/instrumentation-http'
      ) as any;
      const configHttp = instrumentation._config as HttpInstrumentationConfig;

      assert.strictEqual(
        configHttp.applyCustomAttributesOnSpan,
        applyCustomAttributesOnSpan
      );
    });

    it('should not return disabled instrumentation', () => {
      const instrumentations = getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-grpc': {
          enabled: false,
        },
      });
      const instrumentation = instrumentations.find(
        instr =>
          instr.instrumentationName === '@opentelemetry/instrumentation-grpc'
      );
      assert.strictEqual(instrumentation, undefined);
    });

    it('should return only instrumentations enabled via OTEL_NODE_ENABLED_INSTRUMENTATIONS environment variable', () => {
      process.env.OTEL_NODE_ENABLED_INSTRUMENTATIONS =
        'http,aws-sdk, nestjs-core'; // separator with and without whitespaces should be allowed
      try {
        const instrumentations = getNodeAutoInstrumentations();

        assert.deepStrictEqual(
          new Set(instrumentations.map(i => i.instrumentationName)),
          new Set([
            '@opentelemetry/instrumentation-http',
            '@opentelemetry/instrumentation-aws-sdk',
            '@opentelemetry/instrumentation-nestjs-core',
          ])
        );
      } finally {
        delete process.env.OTEL_NODE_ENABLED_INSTRUMENTATIONS;
      }
    });

    it('should show error for none existing instrumentation', () => {
      const spy = sinon.stub(diag, 'error');
      const name = '@opentelemetry/instrumentation-http2';
      const instrumentations = getNodeAutoInstrumentations({
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

      spy.restore();
    });
  });

  describe('getResourceDetectorsFromEnv', () => {
    it('should return all resource detectors by default', () => {
      assert.equal(getResourceDetectorsFromEnv().length, 16);
    });

    it('should return all resource detectors when OTEL_NODE_RESOURCE_DETECTORS contains "all"', () => {
      process.env.OTEL_NODE_RESOURCE_DETECTORS = 'all';
      assert.equal(getResourceDetectorsFromEnv().length, 16);

      delete process.env.OTEL_NODE_RESOURCE_DETECTORS;
    });

    it('should return specific resource detectors depending on OTEL_NODE_RESOURCE_DETECTORS', () => {
      process.env.OTEL_NODE_RESOURCE_DETECTORS = 'env,host,serviceinstance';

      const resourceDetectors = getResourceDetectorsFromEnv();

      assert.equal(resourceDetectors.length, 3);
      assert.equal(resourceDetectors[0].constructor.name, 'EnvDetectorSync');
      assert.equal(resourceDetectors[1].constructor.name, 'HostDetectorSync');
      assert.equal(
        resourceDetectors[2].constructor.name,
        'ServiceInstanceIdDetectorSync'
      );

      delete process.env.OTEL_NODE_RESOURCE_DETECTORS;
    });

    it('should return no resource detectors when OTEL_NODE_RESOURCE_DETECTORS contains "none" or a typo', () => {
      const spy = sinon.stub(diag, 'error');
      process.env.OTEL_NODE_RESOURCE_DETECTORS = 'none';

      assert.equal(getResourceDetectorsFromEnv().length, 0);

      assert.strictEqual(spy.callCount, 0);

      process.env.OTEL_NODE_RESOURCE_DETECTORS = 'test';

      assert.equal(getResourceDetectorsFromEnv().length, 0);

      assert.strictEqual(
        spy.args[0][0],
        'Invalid resource detector "test" specified in the environment variable OTEL_NODE_RESOURCE_DETECTORS'
      );

      spy.restore();
      delete process.env.OTEL_NODE_RESOURCE_DETECTORS;
    });
  });

  describe('getPropagator', () => {
    afterEach(() => {
      delete process.env.OTEL_PROPAGATORS;
    });

    it('should return default when env var is unset', () => {
      assert.deepStrictEqual(getPropagator().fields(), [
        'traceparent',
        'tracestate',
        'baggage',
      ]);
    });

    it('should return default when env var is empty', () => {
      process.env.OTEL_PROPAGATORS = '';
      assert.deepStrictEqual(getPropagator().fields(), [
        'traceparent',
        'tracestate',
        'baggage',
      ]);
    });

    it('should return default when env var is all spaces', () => {
      process.env.OTEL_PROPAGATORS = '  ';
      assert.deepStrictEqual(getPropagator().fields(), [
        'traceparent',
        'tracestate',
        'baggage',
      ]);
    });

    it('should return the selected propagator when one is in the list', () => {
      process.env.OTEL_PROPAGATORS = 'tracecontext';
      assert.deepStrictEqual(getPropagator().fields(), [
        'traceparent',
        'tracestate',
      ]);
    });

    it('should return the selected propagators when multiple are in the list', () => {
      process.env.OTEL_PROPAGATORS = 'b3,jaeger';
      assert.deepStrictEqual(getPropagator().fields(), ['b3', 'uber-trace-id']);
    });

    it('should return no-op propagator if all propagators are unknown', () => {
      process.env.OTEL_PROPAGATORS = 'my, unknown, propagators';
      assert.deepStrictEqual(getPropagator().fields(), []);
    });

    it('should return no-op propagator if "none" is selected', () => {
      process.env.OTEL_PROPAGATORS = 'none';
      assert.deepStrictEqual(getPropagator().fields(), []);
    });
  });
});
