/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = {
  ...require('../../.mocharc.js'),
  loader: 'ts-node/esm/transpile-only',
  require: ['@opentelemetry/contrib-test-utils'],
  spec: 'test/**/*.test.ts',
};
