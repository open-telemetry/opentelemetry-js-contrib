#!/usr/bin/env node
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

/**
 * Run `npm run ARGS...` in every "examples/*" subdir.
 *
 * This script exists because the "examples/*" dirs are *not* part of the npm
 * workspace, so we cannot use `nx run-many ...` or `npm run --workspaces ...`.
 *
 * Example usage:
 *    ./scripts/npm-run-in-examples.js --if-present lint
 */

const {spawn, spawnSync} = require('child_process');
const path = require('path');

const TOP = path.resolve(__dirname, '..');
const USE_COLOR = process.stdout.isTTY && !process.env.NO_COLOR?.length > 0;

function logInfo(...args) {
  if (USE_COLOR) {
    process.stdout.write('\x1b[90m');
  }
  console.log(...args);
  if (USE_COLOR) {
    process.stdout.write('\x1b[39m');
  }
}

function logError(...args) {
  if (USE_COLOR) {
    process.stdout.write('\x1b[31m');
  }
  console.log(...args);
  if (USE_COLOR) {
    process.stdout.write('\x1b[39m');
  }
}

function getExamplesPackageDirs() {
  const p = spawnSync('git', ['ls-files', path.join(TOP, 'examples')], {
    encoding: 'utf8'
  });
  return p.stdout
    .split('\n')
    .filter(f => path.basename(f) === 'package.json')
    .map(path.dirname)
}

async function npmRunInExamples(args) {
  const pkgDirs = getExamplesPackageDirs();

  let finalRetval = 0;
  for (let pkgDir of pkgDirs) {
    logInfo(`\n> ${pkgDir}`);
    const p = spawnSync('npm', ['run'].concat(args), {
      cwd: pkgDir,
      stdio: 'inherit',
      encoding: 'utf8'
    });
    if (p.status || p.signal || p.error) {
      logError(`"npm run ${args.join(' ')}" failed in "${pkgDir}": status=${p.status} signal=${p.signal} error=${p.error}`);
      finalRetval = 1;
    }
  }

  process.exitCode = finalRetval;
}

async function main() {
  await npmRunInExamples(process.argv.slice(2));
}

main();
