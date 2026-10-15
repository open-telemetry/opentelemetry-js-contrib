/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

if (parseInt(process.versions.node.split('.')[0], 10) < 15) {
  console.log('Node version is not supported for testing');
} else {
  require('nyc/bin/nyc');
}
