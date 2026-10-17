/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = {
  ...require('../../.mocharc.json'),
  require: [
    'ts-node/register/transpile-only',
    '@opentelemetry/contrib-test-utils',
  ],
  spec: 'test/**/*.test.ts',
};
