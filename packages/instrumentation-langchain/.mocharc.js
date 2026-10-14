/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const supportsSdk = Number(process.versions.node.split('.')[0]) >= 20;

if (!supportsSdk) {
  console.log(
    'Skipping LangChain SDK suites (requires Node.js >=20); running SDK-independent tests.'
  );
}

module.exports = {
  ...require('../../.mocharc.json'),
  // Select files before Mocha imports them; suite hooks run too late.
  spec: supportsSdk ? 'test/**/*.test.ts' : 'test/instrumentation.test.ts',
};
