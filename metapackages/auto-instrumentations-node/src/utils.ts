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
import {
  DnsInstrumentation,
  DnsInstrumentationConfig,
} from '@opentelemetry/instrumentation-dns';
import {
  ExpressInstrumentation,
  ExpressInstrumentationConfig,
} from '@opentelemetry/instrumentation-express';
import {
  HttpInstrumentation,
  HttpInstrumentationConfig,
} from '@opentelemetry/instrumentation-http';
import {
  GraphQLInstrumentation,
  GraphQLInstrumentationConfig,
} from '@opentelemetry/instrumentation-graphql';
import {
  GrpcInstrumentation,
  // GrpcInstrumentationConfig,
} from '@opentelemetry/instrumentation-grpc';
import { KoaInstrumentation } from '@opentelemetry/instrumentation-koa';
// import {
//   MySQLInstrumentation,
//   MySQLInstrumentationConfig,
// } from '@opentelemetry/instrumentation-mysql';
import {
  IORedisInstrumentation,
  IORedisInstrumentationConfig,
} from '@opentelemetry/instrumentation-ioredis';
import {
  MongoDBInstrumentation,
  MongoDBInstrumentationConfig,
} from '@opentelemetry/instrumentation-mongodb';
import {
  PgInstrumentation,
  PgInstrumentationConfig,
} from '@opentelemetry/instrumentation-pg';
// import {
//   RedisInstrumentation,
//   RedisInstrumentationConfig,
// } from '@opentelemetry/instrumentation-redis';
import {
  Instrumentation,
  InstrumentationConfig,
} from '@opentelemetry/instrumentation';

type InstrumentationMapKeys =
  | '@opentelemetry/instrumentation-dns'
  | '@opentelemetry/instrumentation-express'
  | '@opentelemetry/instrumentation-http'
  | '@opentelemetry/instrumentation-graphql'
  | '@opentelemetry/instrumentation-grpc'
  | '@opentelemetry/instrumentation-koa'
  | '@opentelemetry/instrumentation-ioredis'
  | '@opentelemetry/instrumentation-express'
  | '@opentelemetry/instrumentation-mongodb'
  // | '@opentelemetry/instrumentation-mysql'
  | '@opentelemetry/instrumentation-pg';
// | '@opentelemetry/instrumentation-redis'

type InstrumentationConfigMap = {
  '@opentelemetry/instrumentation-dns'?: DnsInstrumentationConfig;
  '@opentelemetry/instrumentation-express'?: ExpressInstrumentationConfig;
  '@opentelemetry/instrumentation-http'?: HttpInstrumentationConfig;
  '@opentelemetry/instrumentation-graphql'?: GraphQLInstrumentationConfig &
    InstrumentationConfig;
  // '@opentelemetry/instrumentation-grpc'?: GrpcInstrumentationConfig;
  '@opentelemetry/instrumentation-grpc'?: InstrumentationConfig;
  '@opentelemetry/instrumentation-koa'?: InstrumentationConfig;
  '@opentelemetry/instrumentation-ioredis'?: IORedisInstrumentationConfig;
  '@opentelemetry/instrumentation-mongodb'?: MongoDBInstrumentationConfig;
  // '@opentelemetry/instrumentation-mysql'?: MysqlInstrumentationConfig,
  '@opentelemetry/instrumentation-pg'?: PgInstrumentationConfig;
  // '@opentelemetry/instrumentation-redis'?: RedisInstrumentationConfig,
};

const InstrumentationMap: Record<InstrumentationMapKeys, any> = {
  '@opentelemetry/instrumentation-dns': DnsInstrumentation,
  '@opentelemetry/instrumentation-express': ExpressInstrumentation,
  '@opentelemetry/instrumentation-http': HttpInstrumentation,
  '@opentelemetry/instrumentation-graphql': GraphQLInstrumentation,
  '@opentelemetry/instrumentation-grpc': GrpcInstrumentation,
  '@opentelemetry/instrumentation-koa': KoaInstrumentation,
  '@opentelemetry/instrumentation-ioredis': IORedisInstrumentation,
  '@opentelemetry/instrumentation-mongodb': MongoDBInstrumentation,
  // '@opentelemetry/instrumentation-mysql': MySQLInstrumentation,
  '@opentelemetry/instrumentation-pg': PgInstrumentation,
  // '@opentelemetry/instrumentation-redis': RedisInstrumentation,
};

const defaultConfigs: InstrumentationConfigMap = {
  '@opentelemetry/instrumentation-dns': { enabled: true },
  '@opentelemetry/instrumentation-express': { enabled: true },
  '@opentelemetry/instrumentation-http': { enabled: true },
  '@opentelemetry/instrumentation-graphql': { enabled: true },
  '@opentelemetry/instrumentation-grpc': { enabled: true },
  '@opentelemetry/instrumentation-koa': { enabled: true },
  '@opentelemetry/instrumentation-ioredis': { enabled: true },
  '@opentelemetry/instrumentation-mongodb': { enabled: true },
  // '@opentelemetry/instrumentation-mysql': { enabled: true },
  '@opentelemetry/instrumentation-pg': { enabled: true },
  // '@opentelemetry/instrumentation-redis': { enabled: true }
};

export function getNodeAutoInstrumentations(
  inputConfigs: InstrumentationConfigMap = {}
): Instrumentation[] {
  const configs: InstrumentationConfigMap = Object.assign(
    {},
    defaultConfigs,
    inputConfigs
  );
  const keys = Object.keys(configs);
  const instrumentations: Instrumentation[] = [];
  keys.forEach(key => {
    const Instance = InstrumentationMap[key as keyof InstrumentationConfigMap];
    const config = configs[key as keyof InstrumentationConfigMap];
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
      diag.error(`Provided instrumentation name "${key}" not found`);
    }
  });
  return instrumentations;
}
