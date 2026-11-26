/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
export const redisTestConfig = {
  host: process.env.OPENTELEMETRY_REDIS_HOST || 'localhost',
  port: +(process.env.OPENTELEMETRY_REDIS_PORT || 63790),
};

export const redisTestUrl = `redis://${redisTestConfig.host}:${redisTestConfig.port}`;

export const shouldTest = process.env.RUN_REDIS_TESTS;
