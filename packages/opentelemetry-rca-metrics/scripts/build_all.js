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

const execSync = require('child_process').execSync;
const fs = require('fs');
const rimraf = require('rimraf');
const mkdirp = require('mkdirp');
const path = require('path');
const tar = require('tar');
const glob = require('glob');
const os = require('os');
const checksum = require('checksum');

const MAIN_FOLDER = path.resolve(__dirname, '..');
const BUILD_FOLDER = path.resolve(MAIN_FOLDER, 'build/Release');
const ARTIFACTS_FOLDER = path.resolve(MAIN_FOLDER, 'artifacts');
const CACHE_FOLDER = path.join(os.tmpdir(), 'cache');
const PREBUILDS_FOLDER_NAME = 'prebuilds';

const start = new Date().getTime();
let filesToBeBuild = 0;

cleanBefore();
buildAll();
zipBuilds();
cleanAfter();
extractFromBuild();
validate();
createChecksum();
cleanAfter();

function buildAll() {
  const platforms = ['darwin', 'linux', 'win32'];
  const arch = ['arm', 'x64', 'arm64'];
  // const platforms = ['darwin'];
  // const arch = ['x64'];
  // https://nodejs.org/en/download/releases/
  const targets = [
    { version: '8.0.0', abi: '57' },
    { version: '10.0.0', abi: '64' },
    { version: '11.0.0', abi: '67' },
    { version: '12.0.0', abi: '72' },
    { version: '13.0.0', abi: '79' },
    { version: '14.0.0', abi: '83' },
  ];
  filesToBeBuild = platforms.length * arch.length * targets.length;

  console.log(`Files to be build: (${filesToBeBuild})`);

  let count = 0;
  for (let i = 0, j = platforms.length; i < j; i++) {
    for (let k = 0, l = arch.length; k < l; k++) {
      for (let m = 0, n = targets.length; m < n; m++) {
        build(platforms[i], arch[k], targets[m]);
        count++;
        const progress = ((count / filesToBeBuild) * 100).toFixed(2);
        const last = new Date().getTime() - start;
        const totalTime = last / (count / filesToBeBuild);
        const left = Math.round((totalTime - last) / 1000);
        console.log(`Progress: ${progress}%, left: ${left}s`);
      }
    }
  }
}

function build(platform, arch, target) {
  console.log(
    `Building: platform: ${platform}, arch: ${arch}, node version: ${target.version}`
  );

  mkdirp.sync(BUILD_FOLDER);
  mkdirp.sync(CACHE_FOLDER);
  mkdirp.sync(`${PREBUILDS_FOLDER_NAME}/${platform}-${arch}`);

  const output = `${PREBUILDS_FOLDER_NAME}/${platform}-${arch}/node-${target.abi}.node`;
  const cmd = [
    'node-gyp rebuild',
    `--target=${target.version}`,
    `--target_arch=${arch}`,
    `--devdir=${CACHE_FOLDER}`,
    '--release',
    '--build_v8_with_gn=false',
    '--enable_lto=false',
  ].join(' ');

  execSync(cmd, { stdio: [0, 1, 2] });

  fs.copyFileSync(`${BUILD_FOLDER}/metrics.node`, output);

  const sum = checksum(fs.readFileSync(`${BUILD_FOLDER}/metrics.node`));
  fs.writeFileSync(`${output}.sha1`, sum);
}

function zipBuilds() {
  rimraf.sync(ARTIFACTS_FOLDER);
  mkdirp.sync(ARTIFACTS_FOLDER);

  tar.create(
    {
      gzip: true,
      sync: true,
      portable: true,
      strict: true,
      noDirRecurse: true,
      file: path.join(ARTIFACTS_FOLDER, `${PREBUILDS_FOLDER_NAME}.tgz`),
    },
    glob.sync(path.join(PREBUILDS_FOLDER_NAME, '**/*.*'))
  );
}

function extractFromBuild() {
  mkdirp.sync(CACHE_FOLDER);
  tar.extract({
    sync: true,
    strict: true,
    file: path.join(ARTIFACTS_FOLDER, `${PREBUILDS_FOLDER_NAME}.tgz`),
    cwd: CACHE_FOLDER,
  });
}

function validate() {
  const folderPath = path.join(CACHE_FOLDER, PREBUILDS_FOLDER_NAME);
  const filesChecked = [];
  fs.readdirSync(folderPath).forEach(folder => {
    fs.readdirSync(path.join(folderPath, folder))
      .filter(file => /^node-\d+\.node$/.test(file))
      .forEach(file => {
        const content = fs.readFileSync(path.join(folderPath, folder, file));
        const sum = fs.readFileSync(
          path.join(folderPath, folder, `${file}.sha1`),
          'ascii'
        );
        if (sum !== checksum(content)) {
          throw new Error(
            `Invalid checksum for "${PREBUILDS_FOLDER_NAME}/${folder}/${file}".`
          );
        }
        filesChecked.push(`${folder}/${file}`);
      });
  });
  if (filesToBeBuild !== filesChecked.length) {
    throw new Error(
      `Not all files have been checked, files to be build (${filesToBeBuild}), files to be checked (${filesChecked.length})`
    );
  }
  const time = Math.round((new Date().getTime() - start) / 1000);

  console.log(`All went fine, it took: ${time}s to build all.`);
  console.log(
    `Number of files generated and checked: (${filesChecked.length}) ->`,
    filesChecked
  );
}

function createChecksum() {
  const file = path.join(ARTIFACTS_FOLDER, `${PREBUILDS_FOLDER_NAME}.tgz`);
  const sum = checksum(fs.readFileSync(file));
  fs.writeFileSync(`${file}.sha1`, sum);
}

function cleanBefore() {
  rimraf.sync(CACHE_FOLDER);
  rimraf.sync(BUILD_FOLDER);
  rimraf.sync(PREBUILDS_FOLDER_NAME);
}

function cleanAfter() {
  rimraf.sync(CACHE_FOLDER);
  rimraf.sync(PREBUILDS_FOLDER_NAME);
}
