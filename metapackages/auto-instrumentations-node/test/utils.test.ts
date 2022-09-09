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

describe('utils', () => {
  describe('getNodeAutoInstrumentations', () => {
    it('should load default instrumentations', () => {
      const instrumentations = getNodeAutoInstrumentations();
      const expectedInstrumentations = [
        '@opentelemetry/instrumentation-amqplib',
        '@opentelemetry/instrumentation-aws-lambda',
        '@opentelemetry/instrumentation-aws-sdk',
        '@opentelemetry/instrumentation-bunyan',
        '@opentelemetry/instrumentation-cassandra-driver',
        '@opentelemetry/instrumentation-connect',
        '@opentelemetry/instrumentation-dns',
        '@opentelemetry/instrumentation-express',
        '@opentelemetry/instrumentation-fastify',
        '@opentelemetry/instrumentation-generic-pool',
        '@opentelemetry/instrumentation-graphql',
        '@opentelemetry/instrumentation-grpc',
        '@opentelemetry/instrumentation-hapi',
        '@opentelemetry/instrumentation-http',
        '@opentelemetry/instrumentation-ioredis',
        '@opentelemetry/instrumentation-knex',
        '@opentelemetry/instrumentation-koa',
        '@opentelemetry/instrumentation-lru-memoizer',
        '@opentelemetry/instrumentation-memcached',
        '@opentelemetry/instrumentation-mongodb',
        '@opentelemetry/instrumentation-mysql2',
        '@opentelemetry/instrumentation-mysql',
        '@opentelemetry/instrumentation-nestjs-core',
        '@opentelemetry/instrumentation-net',
        '@opentelemetry/instrumentation-pg',
        '@opentelemetry/instrumentation-pino',
        '@opentelemetry/instrumentation-redis',
        '@opentelemetry/instrumentation-redis-4',
        '@opentelemetry/instrumentation-restify',
        '@opentelemetry/instrumentation-winston',
      ];
      assert.strictEqual(instrumentations.length, 30);
      for (let i = 0, j = instrumentations.length; i < j; i++) {
        assert.strictEqual(
          instrumentations[i].instrumentationName,
          expectedInstrumentations[i],
          `Instrumentation ${expectedInstrumentations[i]}, not loaded`
        );
      }
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
    });
  });
});
