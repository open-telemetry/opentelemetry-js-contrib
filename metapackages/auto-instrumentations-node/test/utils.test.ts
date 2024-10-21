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
import { deepStrictEqual, strictEqual, equal } from 'assert';
import { stub } from 'sinon';
import { getNodeAutoInstrumentations } from '../src';
import { getResourceDetectorsFromEnv } from '../src/utils';

describe('utils', () => {
  describe('getNodeAutoInstrumentations', () => {
    it('should include all default instrumentations', () => {
      const instrumentations = getNodeAutoInstrumentations();
      const installedInstrumentations = Object.keys(
        require('../package.json').dependencies
      ).filter(depName => {
        return (
          depName.startsWith('@opentelemetry/instrumentation-') &&
          depName !== '@opentelemetry/instrumentation-fs'
        );
      });

      deepStrictEqual(
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

      strictEqual(
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
      strictEqual(instrumentation, undefined);
    });

    it('should return only instrumentations enabled via OTEL_NODE_ENABLED_INSTRUMENTATIONS environment variable', () => {
      process.env.OTEL_NODE_ENABLED_INSTRUMENTATIONS =
        'http,aws-sdk, nestjs-core'; // separator with and without whitespaces should be allowed
      try {
        const instrumentations = getNodeAutoInstrumentations();

        deepStrictEqual(
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

    it('should allow enabling non-default instrumentations via OTEL_NODE_ENABLED_INSTRUMENTATIONS environment variable', () => {
      process.env.OTEL_NODE_ENABLED_INSTRUMENTATIONS = 'fs'; // separator with and without whitespaces should be allowed
      try {
        const instrumentations = getNodeAutoInstrumentations();

        assert.deepStrictEqual(
          new Set(instrumentations.map(i => i.instrumentationName)),
          new Set(['@opentelemetry/instrumentation-fs'])
        );
      } finally {
        delete process.env.OTEL_NODE_ENABLED_INSTRUMENTATIONS;
      }
    });

    it('should include all instrumentations except those disabled via OTEL_NODE_DISABLED_INSTRUMENTATIONS environment variable', () => {
      process.env.OTEL_NODE_DISABLED_INSTRUMENTATIONS =
        'fs,aws-sdk, aws-lambda'; // separator with and without whitespaces should be allowed
      try {
        const instrumentations = getNodeAutoInstrumentations();
        const disabledInstrumentations = new Set([
          '@opentelemetry/instrumentation-fs',
          '@opentelemetry/instrumentation-aws-sdk',
          '@opentelemetry/instrumentation-aws-lambda',
        ]);
        const enabledInstrumentationNames = new Set(
          instrumentations.map(i => i.instrumentationName)
        );

        for (const disabledInstrumentation of disabledInstrumentations) {
          strictEqual(
            enabledInstrumentationNames.has(disabledInstrumentation),
            false
          );
        }
      } finally {
        delete process.env.OTEL_NODE_DISABLED_INSTRUMENTATIONS;
      }
    });

    it('should disable any instrumentations from OTEL_NODE_ENABLED_INSTRUMENTATIONS if set in OTEL_NODE_DISABLED_INSTRUMENTATIONS', () => {
      process.env.OTEL_NODE_ENABLED_INSTRUMENTATIONS = 'http,express,net';
      process.env.OTEL_NODE_DISABLED_INSTRUMENTATIONS = 'fs,net'; // fs is no-op here, already disabled
      try {
        const instrumentations = getNodeAutoInstrumentations();

        deepStrictEqual(
          new Set(instrumentations.map(i => i.instrumentationName)),
          new Set([
            '@opentelemetry/instrumentation-http',
            '@opentelemetry/instrumentation-express',
          ])
        );
      } finally {
        delete process.env.OTEL_NODE_DISABLED_INSTRUMENTATIONS;
        delete process.env.OTEL_NODE_ENABLED_INSTRUMENTATIONS;
      }
    });

    it('should show error for none existing instrumentation', () => {
      const spy = stub(diag, 'error');
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
      strictEqual(instrumentation, undefined);

      strictEqual(
        spy.args[0][0],
        `Provided instrumentation name "${name}" not found`
      );

      spy.restore();
    });
  });

  describe('getResourceDetectorsFromEnv', () => {
    it('should return all resource detectors by default', () => {
      equal(getResourceDetectorsFromEnv().length, 16);
    });

    it('should return all resource detectors when OTEL_NODE_RESOURCE_DETECTORS contains "all"', () => {
      process.env.OTEL_NODE_RESOURCE_DETECTORS = 'all';
      equal(getResourceDetectorsFromEnv().length, 16);

      delete process.env.OTEL_NODE_RESOURCE_DETECTORS;
    });

    it('should return specific resource detectors depending on OTEL_NODE_RESOURCE_DETECTORS', () => {
      process.env.OTEL_NODE_RESOURCE_DETECTORS = 'env,host,serviceinstance';

      const resourceDetectors = getResourceDetectorsFromEnv();

      equal(resourceDetectors.length, 3);
      equal(resourceDetectors[0].constructor.name, 'EnvDetectorSync');
      equal(resourceDetectors[1].constructor.name, 'HostDetectorSync');
      equal(
        resourceDetectors[2].constructor.name,
        'ServiceInstanceIdDetectorSync'
      );

      delete process.env.OTEL_NODE_RESOURCE_DETECTORS;
    });

    it('should return no resource detectors when OTEL_NODE_RESOURCE_DETECTORS contains "none" or a typo', () => {
      const spy = stub(diag, 'error');
      process.env.OTEL_NODE_RESOURCE_DETECTORS = 'none';

      equal(getResourceDetectorsFromEnv().length, 0);

      strictEqual(spy.callCount, 0);

      process.env.OTEL_NODE_RESOURCE_DETECTORS = 'test';

      equal(getResourceDetectorsFromEnv().length, 0);

      strictEqual(
        spy.args[0][0],
        'Invalid resource detector "test" specified in the environment variable OTEL_NODE_RESOURCE_DETECTORS'
      );

      spy.restore();
      delete process.env.OTEL_NODE_RESOURCE_DETECTORS;
    });
  });
});
