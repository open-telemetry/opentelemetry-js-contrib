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
import { Instrumentation } from '@opentelemetry/instrumentation';
import { AmqplibInstrumentation } from '@opentelemetry/instrumentation-amqplib';
import { AwsLambdaInstrumentation } from '@opentelemetry/instrumentation-aws-lambda';
import { AwsInstrumentation } from '@opentelemetry/instrumentation-aws-sdk';
import { BunyanInstrumentation } from '@opentelemetry/instrumentation-bunyan';
import { CassandraDriverInstrumentation } from '@opentelemetry/instrumentation-cassandra-driver';
import { ConnectInstrumentation } from '@opentelemetry/instrumentation-connect';
import { DataloaderInstrumentation } from '@opentelemetry/instrumentation-dataloader';
import { DnsInstrumentation } from '@opentelemetry/instrumentation-dns';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { GenericPoolInstrumentation } from '@opentelemetry/instrumentation-generic-pool';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc';
import { HapiInstrumentation } from '@opentelemetry/instrumentation-hapi';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { KnexInstrumentation } from '@opentelemetry/instrumentation-knex';
import { KoaInstrumentation } from '@opentelemetry/instrumentation-koa';
import { LruMemoizerInstrumentation } from '@opentelemetry/instrumentation-lru-memoizer';
import { MemcachedInstrumentation } from '@opentelemetry/instrumentation-memcached';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose';
import { MySQL2Instrumentation } from '@opentelemetry/instrumentation-mysql2';
import { MySQLInstrumentation } from '@opentelemetry/instrumentation-mysql';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { NetInstrumentation } from '@opentelemetry/instrumentation-net';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { RedisInstrumentation as RedisInstrumentationV2 } from '@opentelemetry/instrumentation-redis';
import { RedisInstrumentation as RedisInstrumentationV4 } from '@opentelemetry/instrumentation-redis-4';
import { RestifyInstrumentation } from '@opentelemetry/instrumentation-restify';
import { WinstonInstrumentation } from '@opentelemetry/instrumentation-winston';

const InstrumentationMap = {
  '@opentelemetry/instrumentation-amqplib': AmqplibInstrumentation,
  '@opentelemetry/instrumentation-aws-lambda': AwsLambdaInstrumentation,
  '@opentelemetry/instrumentation-aws-sdk': AwsInstrumentation,
  '@opentelemetry/instrumentation-bunyan': BunyanInstrumentation,
  '@opentelemetry/instrumentation-cassandra-driver':
    CassandraDriverInstrumentation,
  '@opentelemetry/instrumentation-connect': ConnectInstrumentation,
  '@opentelemetry/instrumentation-dataloader': DataloaderInstrumentation,
  '@opentelemetry/instrumentation-dns': DnsInstrumentation,
  '@opentelemetry/instrumentation-express': ExpressInstrumentation,
  '@opentelemetry/instrumentation-fastify': FastifyInstrumentation,
  '@opentelemetry/instrumentation-generic-pool': GenericPoolInstrumentation,
  '@opentelemetry/instrumentation-graphql': GraphQLInstrumentation,
  '@opentelemetry/instrumentation-grpc': GrpcInstrumentation,
  '@opentelemetry/instrumentation-hapi': HapiInstrumentation,
  '@opentelemetry/instrumentation-http': HttpInstrumentation,
  '@opentelemetry/instrumentation-ioredis': IORedisInstrumentation,
  '@opentelemetry/instrumentation-knex': KnexInstrumentation,
  '@opentelemetry/instrumentation-koa': KoaInstrumentation,
  '@opentelemetry/instrumentation-lru-memoizer': LruMemoizerInstrumentation,
  '@opentelemetry/instrumentation-memcached': MemcachedInstrumentation,
  '@opentelemetry/instrumentation-mongodb': MongoDBInstrumentation,
  '@opentelemetry/instrumentation-mongoose': MongooseInstrumentation,
  '@opentelemetry/instrumentation-mysql2': MySQL2Instrumentation,
  '@opentelemetry/instrumentation-mysql': MySQLInstrumentation,
  '@opentelemetry/instrumentation-nestjs-core': NestInstrumentation,
  '@opentelemetry/instrumentation-net': NetInstrumentation,
  '@opentelemetry/instrumentation-pg': PgInstrumentation,
  '@opentelemetry/instrumentation-pino': PinoInstrumentation,
  '@opentelemetry/instrumentation-redis': RedisInstrumentationV2,
  '@opentelemetry/instrumentation-redis-4': RedisInstrumentationV4,
  '@opentelemetry/instrumentation-restify': RestifyInstrumentation,
  '@opentelemetry/instrumentation-winston': WinstonInstrumentation,
};

// Config types inferred automatically from the first argument of the constructor
type ConfigArg<T> = T extends new (...args: infer U) => unknown ? U[0] : never;
export type InstrumentationConfigMap = {
  [Name in keyof typeof InstrumentationMap]?: ConfigArg<
    typeof InstrumentationMap[Name]
  >;
};

export function getNodeAutoInstrumentations(
  inputConfigs: InstrumentationConfigMap = {}
): Instrumentation[] {
  for (const name of Object.keys(inputConfigs)) {
    if (!Object.prototype.hasOwnProperty.call(InstrumentationMap, name)) {
      diag.error(`Provided instrumentation name "${name}" not found`);
      continue;
    }
  }

  const instrumentations: Instrumentation[] = [];

  for (const name of Object.keys(InstrumentationMap) as Array<
    keyof typeof InstrumentationMap
  >) {
    const Instance = InstrumentationMap[name];
    // Defaults are defined by the instrumentation itself
    const userConfig = inputConfigs[name] ?? {};

    if (userConfig.enabled === false) {
      diag.debug(`Disabling instrumentation for ${name}`);
      continue;
    }

    try {
      diag.debug(`Loading instrumentation for ${name}`);
      instrumentations.push(new Instance(userConfig));
    } catch (e) {
      diag.error(e);
    }
  }

  return instrumentations;
}
