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

'use strict';

const fs = require('fs');
const rimraf = require('rimraf');
const mkdirp = require('mkdirp');
const os = require('os');
const path = require('path');
const semver = require('semver');
const tar = require('tar');

const args = process.argv.slice(2);
const obj = {};
args.forEach(arg => {
  const arr = arg.split('=');
  if (arr.length === 2) {
    obj[arr[0]] = arr[1];
  }
});

const platform = obj.platform || os.platform();
const arch = obj.arch || process.env.ARCH || os.arch();
const nodeVersion =
  obj.version || process.version.replace(/v/g, '').split('.')[0];

const MAIN_FOLDER = path.resolve(__dirname, '..');
const BUILD_FOLDER = path.resolve(MAIN_FOLDER, 'build/Release');
const ARTIFACTS_FOLDER = path.resolve(MAIN_FOLDER, 'artifacts');
const CACHE_FOLDER = path.join(MAIN_FOLDER, 'cache');
const PREBUILDS_FOLDER_NAME = 'prebuilds';

// https://nodejs.org/en/download/releases/
const targets = [
  { version: '8.0.0', abi: '57' },
  { version: '10.0.0', abi: '64' },
  { version: '11.0.0', abi: '67' },
  { version: '12.0.0', abi: '72' },
  { version: '13.0.0', abi: '79' },
  { version: '14.0.0', abi: '83' },
];
const targetToCopy = targets.filter(target =>
  semver.satisfies(target.version, `=${nodeVersion}`)
)[0];

if (!targetToCopy) {
  throw new Error(
    `Provided version for node (${nodeVersion}) is not supported`
  );
}

cleanBefore();
extractFromBuild();
copyToBuildFolder();
cleanAfter();

function extractFromBuild() {
  mkdirp.sync(CACHE_FOLDER);
  tar.extract({
    sync: true,
    strict: true,
    file: path.join(ARTIFACTS_FOLDER, `${PREBUILDS_FOLDER_NAME}.tgz`),
    cwd: CACHE_FOLDER,
  });
}

function copyToBuildFolder() {
  mkdirp.sync(BUILD_FOLDER);
  const src = `${CACHE_FOLDER}/${PREBUILDS_FOLDER_NAME}/${platform}-${arch}/node-${targetToCopy.abi}.node`;
  const info = `platform: (${platform}), arch: (${arch}), node version: (${targetToCopy.version})`;
  if (!fs.existsSync(src)) {
    throw new Error(`No precompiled file found for ${info}`);
  }
  const dest = `${BUILD_FOLDER}/node-${targetToCopy.abi}.node`;
  fs.copyFileSync(src, dest);
  console.log(`File for ${info} installed successfully`);
}

function cleanBefore() {
  rimraf.sync(BUILD_FOLDER);
}

function cleanAfter() {
  rimraf.sync(CACHE_FOLDER);
}
