/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const { NestInstrumentation } = require('../../dist/index.cjs');
const { run } = require('./scenario.cjs');

run(NestInstrumentation, () => ({
  core: require('@nestjs/core'),
  common: require('@nestjs/common'),
  platform: require('@nestjs/platform-express'),
})).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
