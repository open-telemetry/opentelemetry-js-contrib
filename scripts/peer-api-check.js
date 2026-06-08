/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Usage: `node ./scripts/peer-api-check.js`

const fs = require('fs');
const path = require('path');
const globSync = require('glob').sync;
const TOP = path.resolve(__dirname, '..');

function getAllWorkspaceDirs() {
  const pj = JSON.parse(
    fs.readFileSync(path.join(TOP, 'package.json'), 'utf8')
  );
  return pj.workspaces
    .map(wsGlob => globSync(path.join(wsGlob, 'package.json')))
    .flat()
    .map(path.dirname);
}

// Check on all dirs
getAllWorkspaceDirs().forEach(appRoot => {
  const packageJsonUrl = path.resolve(`${appRoot}/package.json`);
  const pjson = require(packageJsonUrl);
  const semver = require('semver');

  const isExample = pjson.private && /-example$/.test(pjson.name);

  if (isExample) {
    return console.log(
      `Skipping checking ${pjson.name} because it's an example`
    );
  }

  if (pjson.dependencies && pjson.dependencies['@opentelemetry/api']) {
    throw new Error(
      `Package ${pjson.name} depends on API but it should be a peer dependency`
    );
  }

  const peerVersion =
    pjson.peerDependencies && pjson.peerDependencies['@opentelemetry/api'];
  const devVersion =
    pjson.devDependencies && pjson.devDependencies['@opentelemetry/api'];
  if (peerVersion) {
    if (!semver.subset(devVersion, peerVersion)) {
      throw new Error(
        `Package ${pjson.name} depends on peer API version ${peerVersion} ` +
          `but version ${devVersion} in development which doesn't match the peer API version`
      );
    }
    console.log(`${pjson.name} OK`);
  }
});
