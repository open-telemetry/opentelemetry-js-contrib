/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const path = require('path');

module.exports = {
  require: [
    'ts-node/register/transpile-only',
    path.join(__dirname, 'scripts/mocha-otel-condition.cjs'),
  ],
  timeout: 10000,
};
