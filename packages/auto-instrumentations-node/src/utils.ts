/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createRequire } from 'node:module';

import { diag } from '@opentelemetry/api';
import { Instrumentation } from '@opentelemetry/instrumentation';

import type { AmqplibInstrumentation } from '@opentelemetry/instrumentation-amqplib';
import type { AwsLambdaInstrumentation } from '@opentelemetry/instrumentation-aws-lambda';
import type { AwsInstrumentation } from '@opentelemetry/instrumentation-aws-sdk';
import type { BunyanInstrumentation } from '@opentelemetry/instrumentation-bunyan';
import type { CassandraDriverInstrumentation } from '@opentelemetry/instrumentation-cassandra-driver';
import type { ConnectInstrumentation } from '@opentelemetry/instrumentation-connect';
import type { CucumberInstrumentation } from '@opentelemetry/instrumentation-cucumber';
import type { DataloaderInstrumentation } from '@opentelemetry/instrumentation-dataloader';
import type { DnsInstrumentation } from '@opentelemetry/instrumentation-dns';
import type { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import type { FsInstrumentation } from '@opentelemetry/instrumentation-fs';
import type { GenericPoolInstrumentation } from '@opentelemetry/instrumentation-generic-pool';
import type { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import type { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc';
import type { HapiInstrumentation } from '@opentelemetry/instrumentation-hapi';
import type { HostMetricsInstrumentation } from '@opentelemetry/instrumentation-host-metrics';
import type { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import type { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import type { KafkaJsInstrumentation } from '@opentelemetry/instrumentation-kafkajs';
import type { KnexInstrumentation } from '@opentelemetry/instrumentation-knex';
import type { KoaInstrumentation } from '@opentelemetry/instrumentation-koa';
import type { LruMemoizerInstrumentation } from '@opentelemetry/instrumentation-lru-memoizer';
import type { MemcachedInstrumentation } from '@opentelemetry/instrumentation-memcached';
import type { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import type { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose';
import type { MySQL2Instrumentation } from '@opentelemetry/instrumentation-mysql2';
import type { MySQLInstrumentation } from '@opentelemetry/instrumentation-mysql';
import type { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import type { NetInstrumentation } from '@opentelemetry/instrumentation-net';
import type { OpenAIInstrumentation } from '@opentelemetry/instrumentation-openai';
import type { OracleInstrumentation } from '@opentelemetry/instrumentation-oracledb';
import type { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import type { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import type { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import type { RestifyInstrumentation } from '@opentelemetry/instrumentation-restify';
import type { RouterInstrumentation } from '@opentelemetry/instrumentation-router';
import type { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import type { SocketIoInstrumentation } from '@opentelemetry/instrumentation-socket.io';
import type { TediousInstrumentation } from '@opentelemetry/instrumentation-tedious';
import type { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import type { WinstonInstrumentation } from '@opentelemetry/instrumentation-winston';

import { alibabaCloudEcsDetector } from '@opentelemetry/resource-detector-alibaba-cloud';
import {
  awsBeanstalkDetector,
  awsEc2Detector,
  awsEcsDetector,
  awsEksDetector,
  awsLambdaDetector,
} from '@opentelemetry/resource-detector-aws';
import { containerDetector } from '@opentelemetry/resource-detector-container';
import { gcpDetector } from '@opentelemetry/resource-detector-gcp';
import {
  ResourceDetector,
  envDetector,
  hostDetector,
  osDetector,
  processDetector,
  serviceInstanceIdDetector,
} from '@opentelemetry/resources';
import {
  azureAppServiceDetector,
  azureFunctionsDetector,
  azureVmDetector,
} from '@opentelemetry/resource-detector-azure';

const RESOURCE_DETECTOR_CONTAINER = 'container';
const RESOURCE_DETECTOR_ENVIRONMENT = 'env';
const RESOURCE_DETECTOR_HOST = 'host';
const RESOURCE_DETECTOR_OS = 'os';
const RESOURCE_DETECTOR_SERVICE_INSTANCE_ID = 'serviceinstance';
const RESOURCE_DETECTOR_PROCESS = 'process';
const RESOURCE_DETECTOR_ALIBABA = 'alibaba';
const RESOURCE_DETECTOR_AWS = 'aws';
const RESOURCE_DETECTOR_AZURE = 'azure';
const RESOURCE_DETECTOR_GCP = 'gcp';

// Resolved against this module's own location, so that instrumentations are
// loaded from this package's dependencies rather than from wherever the
// application happens to resolve bare specifiers.
const requireInstrumentationModule = createRequire(__filename);

// Instrumentations are loaded on demand, and only when enabled, so that a module
// that cannot be loaded at all costs only its own instrumentation instead of
// preventing the SDK — and with it the application — from starting.
const InstrumentationMap = {
  '@opentelemetry/instrumentation-amqplib': (): typeof AmqplibInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-amqplib')
      .AmqplibInstrumentation,
  '@opentelemetry/instrumentation-aws-lambda':
    (): typeof AwsLambdaInstrumentation =>
      requireInstrumentationModule('@opentelemetry/instrumentation-aws-lambda')
        .AwsLambdaInstrumentation,
  '@opentelemetry/instrumentation-aws-sdk': (): typeof AwsInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-aws-sdk')
      .AwsInstrumentation,
  '@opentelemetry/instrumentation-bunyan': (): typeof BunyanInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-bunyan')
      .BunyanInstrumentation,
  '@opentelemetry/instrumentation-cassandra-driver':
    (): typeof CassandraDriverInstrumentation =>
      requireInstrumentationModule(
        '@opentelemetry/instrumentation-cassandra-driver'
      ).CassandraDriverInstrumentation,
  '@opentelemetry/instrumentation-connect': (): typeof ConnectInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-connect')
      .ConnectInstrumentation,
  '@opentelemetry/instrumentation-cucumber':
    (): typeof CucumberInstrumentation =>
      requireInstrumentationModule('@opentelemetry/instrumentation-cucumber')
        .CucumberInstrumentation,
  '@opentelemetry/instrumentation-dataloader':
    (): typeof DataloaderInstrumentation =>
      requireInstrumentationModule('@opentelemetry/instrumentation-dataloader')
        .DataloaderInstrumentation,
  '@opentelemetry/instrumentation-dns': (): typeof DnsInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-dns')
      .DnsInstrumentation,
  '@opentelemetry/instrumentation-express': (): typeof ExpressInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-express')
      .ExpressInstrumentation,
  '@opentelemetry/instrumentation-fs': (): typeof FsInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-fs')
      .FsInstrumentation,
  '@opentelemetry/instrumentation-generic-pool':
    (): typeof GenericPoolInstrumentation =>
      requireInstrumentationModule(
        '@opentelemetry/instrumentation-generic-pool'
      ).GenericPoolInstrumentation,
  '@opentelemetry/instrumentation-graphql': (): typeof GraphQLInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-graphql')
      .GraphQLInstrumentation,
  '@opentelemetry/instrumentation-grpc': (): typeof GrpcInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-grpc')
      .GrpcInstrumentation,
  '@opentelemetry/instrumentation-hapi': (): typeof HapiInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-hapi')
      .HapiInstrumentation,
  '@opentelemetry/instrumentation-host-metrics':
    (): typeof HostMetricsInstrumentation =>
      requireInstrumentationModule(
        '@opentelemetry/instrumentation-host-metrics'
      ).HostMetricsInstrumentation,
  '@opentelemetry/instrumentation-http': (): typeof HttpInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-http')
      .HttpInstrumentation,
  '@opentelemetry/instrumentation-ioredis': (): typeof IORedisInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-ioredis')
      .IORedisInstrumentation,
  '@opentelemetry/instrumentation-kafkajs': (): typeof KafkaJsInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-kafkajs')
      .KafkaJsInstrumentation,
  '@opentelemetry/instrumentation-knex': (): typeof KnexInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-knex')
      .KnexInstrumentation,
  '@opentelemetry/instrumentation-koa': (): typeof KoaInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-koa')
      .KoaInstrumentation,
  '@opentelemetry/instrumentation-lru-memoizer':
    (): typeof LruMemoizerInstrumentation =>
      requireInstrumentationModule(
        '@opentelemetry/instrumentation-lru-memoizer'
      ).LruMemoizerInstrumentation,
  '@opentelemetry/instrumentation-memcached':
    (): typeof MemcachedInstrumentation =>
      requireInstrumentationModule('@opentelemetry/instrumentation-memcached')
        .MemcachedInstrumentation,
  '@opentelemetry/instrumentation-mongodb': (): typeof MongoDBInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-mongodb')
      .MongoDBInstrumentation,
  '@opentelemetry/instrumentation-mongoose':
    (): typeof MongooseInstrumentation =>
      requireInstrumentationModule('@opentelemetry/instrumentation-mongoose')
        .MongooseInstrumentation,
  '@opentelemetry/instrumentation-mysql2': (): typeof MySQL2Instrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-mysql2')
      .MySQL2Instrumentation,
  '@opentelemetry/instrumentation-mysql': (): typeof MySQLInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-mysql')
      .MySQLInstrumentation,
  '@opentelemetry/instrumentation-nestjs-core':
    (): typeof NestInstrumentation =>
      requireInstrumentationModule('@opentelemetry/instrumentation-nestjs-core')
        .NestInstrumentation,
  '@opentelemetry/instrumentation-net': (): typeof NetInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-net')
      .NetInstrumentation,
  '@opentelemetry/instrumentation-openai': (): typeof OpenAIInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-openai')
      .OpenAIInstrumentation,
  '@opentelemetry/instrumentation-oracledb': (): typeof OracleInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-oracledb')
      .OracleInstrumentation,
  '@opentelemetry/instrumentation-pg': (): typeof PgInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-pg')
      .PgInstrumentation,
  '@opentelemetry/instrumentation-pino': (): typeof PinoInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-pino')
      .PinoInstrumentation,
  '@opentelemetry/instrumentation-redis': (): typeof RedisInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-redis')
      .RedisInstrumentation,
  '@opentelemetry/instrumentation-restify': (): typeof RestifyInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-restify')
      .RestifyInstrumentation,
  '@opentelemetry/instrumentation-router': (): typeof RouterInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-router')
      .RouterInstrumentation,
  '@opentelemetry/instrumentation-runtime-node':
    (): typeof RuntimeNodeInstrumentation =>
      requireInstrumentationModule(
        '@opentelemetry/instrumentation-runtime-node'
      ).RuntimeNodeInstrumentation,
  '@opentelemetry/instrumentation-socket.io':
    (): typeof SocketIoInstrumentation =>
      requireInstrumentationModule('@opentelemetry/instrumentation-socket.io')
        .SocketIoInstrumentation,
  '@opentelemetry/instrumentation-tedious': (): typeof TediousInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-tedious')
      .TediousInstrumentation,
  '@opentelemetry/instrumentation-undici': (): typeof UndiciInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-undici')
      .UndiciInstrumentation,
  '@opentelemetry/instrumentation-winston': (): typeof WinstonInstrumentation =>
    requireInstrumentationModule('@opentelemetry/instrumentation-winston')
      .WinstonInstrumentation,
};

const defaultExcludedInstrumentations = [
  '@opentelemetry/instrumentation-fs',
  '@opentelemetry/instrumentation-host-metrics',
];

// Config types inferred automatically from the first argument of the constructor
type ConfigArg<T> = T extends new (...args: infer U) => unknown ? U[0] : never;
export type InstrumentationConfigMap = {
  [Name in keyof typeof InstrumentationMap]?: ConfigArg<
    ReturnType<(typeof InstrumentationMap)[Name]>
  >;
};

function shouldDisableInstrumentation(
  name: string,
  userConfig: any,
  enabledInstrumentationsFromEnv: string[],
  disabledInstrumentationsFromEnv: string[]
): boolean {
  // Priority 1: Programmatic config
  if (userConfig.enabled === false) {
    diag.debug(
      `Disabling instrumentation for ${name} - disabled by user config`
    );
    return true;
  }

  if (userConfig.enabled === true) {
    diag.debug(
      `Enabling instrumentation for ${name} - explicitly enabled by user config`
    );
    return false;
  }

  // Priority 2: Environment variables
  if (disabledInstrumentationsFromEnv.includes(name)) {
    diag.debug(`Disabling instrumentation for ${name} - disabled by env var`);
    return true;
  }

  const isEnabledEnvSet = !!process.env.OTEL_NODE_ENABLED_INSTRUMENTATIONS;
  if (isEnabledEnvSet && !enabledInstrumentationsFromEnv.includes(name)) {
    diag.debug(
      `Disabling instrumentation for ${name} - not in enabled env var list`
    );
    return true;
  }

  // Priority 3: Default exclusions
  if (!isEnabledEnvSet && defaultExcludedInstrumentations.includes(name)) {
    diag.debug(`Disabling instrumentation for ${name} - excluded by default`);
    return true;
  }

  return false;
}

export function getNodeAutoInstrumentations(
  inputConfigs: InstrumentationConfigMap = {}
): Instrumentation[] {
  checkManuallyProvidedInstrumentationNames(Object.keys(inputConfigs));
  const enabledInstrumentationsFromEnv = getEnabledInstrumentationsFromEnv();
  const disabledInstrumentationsFromEnv = getDisabledInstrumentationsFromEnv();

  const instrumentations: Instrumentation[] = [];

  for (const name of Object.keys(InstrumentationMap) as Array<
    keyof typeof InstrumentationMap
  >) {
    // Defaults are defined by the instrumentation itself
    const userConfig: any = inputConfigs[name] ?? {};

    const shouldDisable = shouldDisableInstrumentation(
      name,
      userConfig,
      enabledInstrumentationsFromEnv,
      disabledInstrumentationsFromEnv
    );

    if (shouldDisable) {
      continue;
    }

    try {
      diag.debug(`Loading instrumentation for ${name}`);
      const Instance = InstrumentationMap[name]();
      instrumentations.push(new Instance(userConfig));
    } catch (e: any) {
      diag.error(`Skipping instrumentation for ${name}`, e);
    }
  }

  return instrumentations;
}

function checkManuallyProvidedInstrumentationNames(
  manuallyProvidedInstrumentationNames: string[]
) {
  for (const name of manuallyProvidedInstrumentationNames) {
    if (!Object.prototype.hasOwnProperty.call(InstrumentationMap, name)) {
      diag.error(`Provided instrumentation name "${name}" not found`);
    }
  }
}

function getInstrumentationsFromEnv(envVar: string): string[] {
  const envVarValue = process.env[envVar];
  if (envVarValue == null) {
    return [];
  }

  const instrumentationsFromEnv = envVarValue
    ?.split(',')
    .map(
      instrumentationPkgSuffix =>
        `@opentelemetry/instrumentation-${instrumentationPkgSuffix.trim()}`
    );
  checkManuallyProvidedInstrumentationNames(instrumentationsFromEnv);
  return instrumentationsFromEnv;
}

/**
 * Returns the list of instrumentations that are enabled based on the environment variable.
 * If the environment variable is unset, returns all instrumentation that are enabled by default.
 */
function getEnabledInstrumentationsFromEnv() {
  if (!process.env.OTEL_NODE_ENABLED_INSTRUMENTATIONS) {
    // all keys in the InstrumentationMap except for everything that is not enabled by default.
    return Object.keys(InstrumentationMap).filter(
      key => !defaultExcludedInstrumentations.includes(key)
    );
  }

  const instrumentationsFromEnv = getInstrumentationsFromEnv(
    'OTEL_NODE_ENABLED_INSTRUMENTATIONS'
  );
  return instrumentationsFromEnv;
}

/**
 * Returns the list of instrumentations that are disabled based on the environment variable.
 */
function getDisabledInstrumentationsFromEnv() {
  if (!process.env.OTEL_NODE_DISABLED_INSTRUMENTATIONS) {
    return [];
  }

  const instrumentationsFromEnv = getInstrumentationsFromEnv(
    'OTEL_NODE_DISABLED_INSTRUMENTATIONS'
  );
  return instrumentationsFromEnv;
}

export function getResourceDetectorsFromEnv(): Array<ResourceDetector> {
  const resourceDetectors = new Map<
    string,
    ResourceDetector | ResourceDetector[]
  >([
    [RESOURCE_DETECTOR_CONTAINER, containerDetector],
    [RESOURCE_DETECTOR_HOST, hostDetector],
    [RESOURCE_DETECTOR_OS, osDetector],
    [RESOURCE_DETECTOR_SERVICE_INSTANCE_ID, serviceInstanceIdDetector],
    [RESOURCE_DETECTOR_PROCESS, processDetector],
    [RESOURCE_DETECTOR_ALIBABA, alibabaCloudEcsDetector],
    [RESOURCE_DETECTOR_GCP, gcpDetector],
    [
      RESOURCE_DETECTOR_AWS,
      [
        awsEc2Detector,
        awsEcsDetector,
        awsEksDetector,
        awsBeanstalkDetector,
        awsLambdaDetector,
      ],
    ],
    [
      RESOURCE_DETECTOR_AZURE,
      [azureAppServiceDetector, azureFunctionsDetector, azureVmDetector],
    ],
    [RESOURCE_DETECTOR_ENVIRONMENT, envDetector],
  ]);

  const resourceDetectorsFromEnv =
    process.env.OTEL_NODE_RESOURCE_DETECTORS?.split(',') ?? ['all'];

  if (resourceDetectorsFromEnv.includes('all')) {
    return [...resourceDetectors.values()].flat();
  }

  if (resourceDetectorsFromEnv.includes('none')) {
    return [];
  }

  return resourceDetectorsFromEnv.flatMap(detector => {
    const resourceDetector = resourceDetectors.get(detector);
    if (!resourceDetector) {
      diag.error(
        `Invalid resource detector "${detector}" specified in the environment variable OTEL_NODE_RESOURCE_DETECTORS`
      );
    }
    return resourceDetector || [];
  });
}
