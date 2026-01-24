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
          depName !== '@opentelemetry/instrumentation-fs' &&
          depName !== '@opentelemetry/instrumentation-fastify'
        );
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
          assert.strictEqual(
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

        assert.deepStrictEqual(
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

    it('should enable fs instrumentation when explicitly enabled and OTEL_NODE_ENABLED_INSTRUMENTATIONS is not set', () => {
      const instrumentations = getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: true,
        },
      });
      const fsInstrumentation = instrumentations.find(
        instr =>
          instr.instrumentationName === '@opentelemetry/instrumentation-fs'
      );
      assert.notStrictEqual(
        fsInstrumentation,
        undefined,
        'fs instrumentation should be included when explicitly enabled in config and env var is not set'
      );
    });

    it('should respect programmatic config over OTEL_NODE_ENABLED_INSTRUMENTATIONS - user config overrides env var', () => {
      process.env.OTEL_NODE_ENABLED_INSTRUMENTATIONS = 'fs,http';
      try {
        const instrumentations = getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': {
            enabled: false, // User explicitly disables - should override env var
          },
          '@opentelemetry/instrumentation-express': {
            enabled: true, // User explicitly enables - should override env var
          },
        });

        const fsInstrumentation = instrumentations.find(
          instr =>
            instr.instrumentationName === '@opentelemetry/instrumentation-fs'
        );
        const httpInstrumentation = instrumentations.find(
          instr =>
            instr.instrumentationName === '@opentelemetry/instrumentation-http'
        );
        const expressInstrumentation = instrumentations.find(
          instr =>
            instr.instrumentationName ===
            '@opentelemetry/instrumentation-express'
        );

        assert.strictEqual(
          fsInstrumentation,
          undefined,
          'fs should be disabled by user config despite env var'
        );
        assert.notStrictEqual(
          httpInstrumentation,
          undefined,
          'http should be enabled by env var (no user override)'
        );
        assert.notStrictEqual(
          expressInstrumentation,
          undefined,
          'express should be enabled by user config despite not being in env var list'
        );
      } finally {
        delete process.env.OTEL_NODE_ENABLED_INSTRUMENTATIONS;
      }
    });

    it('should respect programmatic config over OTEL_NODE_DISABLED_INSTRUMENTATIONS - user config overrides env var', () => {
      process.env.OTEL_NODE_DISABLED_INSTRUMENTATIONS = 'http';
      try {
        const instrumentations = getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-http': {
            enabled: true, // User explicitly enables - should override env var
          },
        });
        const httpInstrumentation = instrumentations.find(
          instr =>
            instr.instrumentationName === '@opentelemetry/instrumentation-http'
        );

        assert.notStrictEqual(
          httpInstrumentation,
          undefined,
          'http instrumentation should be enabled by user config despite OTEL_NODE_DISABLED_INSTRUMENTATIONS'
        );
      } finally {
        delete process.env.OTEL_NODE_DISABLED_INSTRUMENTATIONS;
      }
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
      assert.equal(resourceDetectors[0].constructor.name, 'EnvDetector');
      assert.equal(resourceDetectors[1].constructor.name, 'HostDetector');
      assert.equal(
        resourceDetectors[2].constructor.name,
        'ServiceInstanceIdDetector'
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
});
