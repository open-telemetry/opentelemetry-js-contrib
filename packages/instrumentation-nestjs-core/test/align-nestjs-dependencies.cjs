/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

const packages = ['@nestjs/core', '@nestjs/common', '@nestjs/platform-express'];
function installedVersion(name) {
  return JSON.parse(
    readFileSync(join(dirname(require.resolve(name)), 'package.json'), 'utf8')
  ).version;
}

const expectedVersion = process.argv[2];
if (expectedVersion) {
  for (const name of packages) {
    assert.equal(installedVersion(name), expectedVersion, name);
  }
  console.log(`Testing matching NestJS packages at ${expectedVersion}`);
} else {
  const version = installedVersion('@nestjs/core');
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run test-all-versions through npm.');

  // Keep the version selected by TAV while aligning its coupled dependencies.
  // Installing only the peers would let npm restore core from package.json.
  execFileSync(
    process.execPath,
    [
      npm,
      'install',
      '--workspace=@opentelemetry/instrumentation-nestjs-core',
      // Use nested installs so npm 10 also honors these temporary versions.
      '--install-strategy=nested',
      '--no-save',
      '--no-audit',
      '--no-fund',
      ...packages.map(name => `${name}@${version}`),
    ],
    { stdio: 'inherit' }
  );

  // Resolve in a fresh process: npm can change where dependencies are hoisted.
  execFileSync(process.execPath, [__filename, version], { stdio: 'inherit' });
}
