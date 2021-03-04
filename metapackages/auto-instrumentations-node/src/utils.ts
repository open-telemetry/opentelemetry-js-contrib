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
import { DnsInstrumentation } from '@opentelemetry/instrumentation-dns';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc';
import { KoaInstrumentation } from '@opentelemetry/instrumentation-koa';
// import { MySQLInstrumentation } from '@opentelemetry/instrumentation-mysql';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
// import MongoDBInstrumentation from '@opentelemetry/instrumentation-mongodb';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
// import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';

import { Instrumentation } from '@opentelemetry/instrumentation';
import { Configs } from './types';

const defaultConfigurations: Configs = {
  '@opentelemetry/instrumentation-dns': { enabled: true },
  '@opentelemetry/instrumentation-express': { enabled: true },
  '@opentelemetry/instrumentation-http': { enabled: true },
  '@opentelemetry/instrumentation-grpc': { enabled: true },
  '@opentelemetry/instrumentation-koa': { enabled: true },
  '@opentelemetry/instrumentation-ioredis': { enabled: true },
  // '@opentelemetry/instrumentation-mongodb': { enabled: true },
  // '@opentelemetry/instrumentation-mysql': { enabled: true },
  '@opentelemetry/instrumentation-pg': { enabled: true },
  // '@opentelemetry/instrumentation-redis': { enabled: true }
};

const mapping: Record<string, any> = {
  '@opentelemetry/instrumentation-dns': DnsInstrumentation,
  '@opentelemetry/instrumentation-express': ExpressInstrumentation,
  '@opentelemetry/instrumentation-http': HttpInstrumentation,
  '@opentelemetry/instrumentation-grpc': GrpcInstrumentation,
  '@opentelemetry/instrumentation-koa': KoaInstrumentation,
  '@opentelemetry/instrumentation-ioredis': IORedisInstrumentation,
  // '@opentelemetry/instrumentation-mongodb': MongoDBInstrumentation,
  // '@opentelemetry/instrumentation-mysql': MySQLInstrumentation,
  '@opentelemetry/instrumentation-pg': PgInstrumentation,
  // '@opentelemetry/instrumentation-redis': RedisInstrumentation,
};

export function getNodeAutoInstrumentations(
  inputConfigs: Configs = {}
): Instrumentation[] {
  const configs = Object.assign({}, defaultConfigurations, inputConfigs);
  const keys = Object.keys(configs);
  const instrumentations: Instrumentation[] = [];
  keys.forEach(key => {
    const Instance = mapping[key];
    const config = configs[key];
    if (Instance) {
      try {
        if (config?.enabled === false) {
          diag.debug(`Disabling instrumentation for ${key}`);
        } else {
          diag.debug(`Loading instrumentation for ${key}`);
          instrumentations.push(new Instance(config));
        }
      } catch (e) {
        diag.error(e);
      }
    } else {
      diag.error(`Provided instrumentation name ${key} not found`);
    }
  });
  return instrumentations;
}
