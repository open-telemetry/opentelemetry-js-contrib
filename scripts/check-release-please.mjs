/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import path from 'node:path';
import { globSync, readFileSync } from 'node:fs';

/*
	Enumerates through

	- workspace packages,
	- release please's manifest, and
	- release please's config, and

	makes sure all those lists are in sync. If not, guides you to do the correct thing
*/

const errors = [];
const logErrorIf = (condition, errorMessage) => {
  if (condition) {
    errors.push(errorMessage);
  }
};
const PROJECT_ROOT = process.cwd();
const readJson = filePath => {
  return JSON.parse(readFileSync(filePath));
};

const getPackages = () => {
  const TOP = process.cwd();
  const pj = readJson(path.join(TOP, 'package.json'));
  return pj.workspaces
    .map(wsGlob => globSync(path.join(wsGlob, 'package.json')))
    .flat()
    .map(p => {
      const pkgInfo = readJson(p);
      pkgInfo.location = path.dirname(p);
      pkgInfo.relativeLocation = path.relative(PROJECT_ROOT, pkgInfo.location);
      return pkgInfo;
    });
};

const pkgList = getPackages();
const manifest = readJson('.release-please-manifest.json');
const config = readJson('release-please-config.json');

const packageLocations = new Set(
  pkgList.map(pkgInfo => pkgInfo.relativeLocation)
);
const manifestPackages = new Set(Object.keys(manifest));
const configPackages = new Set(Object.keys(config.packages));

pkgList.forEach(pkgInfo => {
  const relativeLocation = pkgInfo.relativeLocation;
  if (pkgInfo.private) {
    // Should be in config, with `skip-github-release` option.
    const configEntry = config.packages[relativeLocation];
    if (!configEntry) {
      errors.push(`Could not find "${relativeLocation}" entry in release-please-config.json. If you are adding a new package. Add following to "packages" object:
    "${relativeLocation}": { "skip-github-release": true },`);
    } else if (configEntry['skip-github-release'] !== true) {
      errors.push(
        `The "${relativeLocation}" entry in release-please-config.json should have the '"skip-github-release": true' option`
      );
    }
  } else {
    // Should be in manifest and config.
    logErrorIf(
      !manifestPackages.has(relativeLocation),
      `Could not find "${relativeLocation}" entry in .release-please-manifest.json. If you are adding a new package. Add following
    "${relativeLocation}": "0.0.1",`
    );

    logErrorIf(
      !configPackages.has(relativeLocation),
      `Could not find "${relativeLocation}" entry in release-please-config.json. If you are adding a new package. Add following to "packages" object
    "${relativeLocation}": {},`
    );
  }
});

manifestPackages.forEach(relativeLocation => {
  logErrorIf(
    !packageLocations.has(relativeLocation),
    `Extraneous path ${relativeLocation} in .release-please-manifest.json`
  );
});

configPackages.forEach(relativeLocation => {
  logErrorIf(
    !packageLocations.has(relativeLocation),
    `Extraneous path ${relativeLocation} in release-please-config.json`
  );
});

if (errors.length) {
  console.error('Errors occured:\n');
  console.error(errors.join('\n\n'));
  process.exit(1);
} else {
  console.error('OK');
}
