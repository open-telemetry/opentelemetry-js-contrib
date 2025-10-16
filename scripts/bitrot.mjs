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
 * A script to check if some things (e.g. config files) have out of date data.
 * This can be useful for checking things where fully automated updating isn't
 * worth it.
 *
 * See "BITROT:" comments for things that are checked.
 *
 * Usage:
 *      node scripts/bitrot.mjs
 */

import * as assert from 'assert';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';
import { satisfies } from 'semver';

const TOP = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const USE_COLOR = process.stdout.isTTY && !process.env.NO_COLOR?.length > 0;
const BUILD_DIR = path.join(TOP, 'build', 'bitrot');

let numProbs = 0;
function problem(...args) {
  numProbs += 1;
  if (USE_COLOR) {
    process.stdout.write('\x1b[31m');
  }
  args.unshift('bitrot error:');
  console.log(...args);
  if (USE_COLOR) {
    process.stdout.write('\x1b[39m');
  }
}

function warn(...args) {
  if (USE_COLOR) {
    process.stdout.write('\x1b[33m');
  }
  args.unshift('bitrot warn:');
  console.warn(...args);
  if (USE_COLOR) {
    process.stdout.write('\x1b[39m');
  }
}

function gitCloneSync(repo, dir) {
  execSync(`git clone ${repo} "${dir}"`);
}
function gitPullSync(cwd) {
  execSync('git pull', { cwd });
}

function isPublicPackage(pj) {
  if (pj.private === true) {
    return false;
  } else if (pj.publishConfig?.access) {
    return pj.publishConfig.access === 'public';
  } else {
    // Default is *false* for scoped packages.
    return !pj.name.startsWith('@');
  }
}

/**
 * BITROT: Check that the `"groupName": "OTel Core experimental",`
 * group in renovate.json matches the actual current set of experimental
 * packages from the core repo.
 */
function bitrotRenovateCoreExperimental() {
  const renovateJson = path.join(TOP, 'renovate.json');
  const renovate = JSON.parse(fs.readFileSync(renovateJson));
  const group = renovate.packageRules.filter(
    r => r.groupName === 'OTel Core experimental'
  )[0];
  assert.ok(group, `found "OTel Core experimental" group in ${renovateJson}`);

  const ojDir = path.join(BUILD_DIR, 'opentelemetry-js');
  if (fs.existsSync(ojDir)) {
    gitPullSync(ojDir);
  } else {
    gitCloneSync(
      'https://github.com/open-telemetry/opentelemetry-js.git',
      ojDir
    );
  }

  const pkgNames = globSync(
    path.join(ojDir, 'experimental/packages/*/package.json')
  )
    .map(packageJson => JSON.parse(fs.readFileSync(packageJson)))
    .filter(pj => isPublicPackage(pj))
    .map(pj => pj.name);

  const pkgNamesSet = new Set(pkgNames);
  const renovateSet = new Set(group.matchPackageNames);
  const missing = pkgNamesSet.difference(renovateSet); // requires Node.js >=22
  const extraneous = renovateSet.difference(pkgNamesSet);

  const issues = [];
  if (missing.size) {
    issues.push(`missing entries: ${JSON.stringify(Array.from(missing))}`);
  }
  if (extraneous.size) {
    issues.push(
      `extraneous entries: ${JSON.stringify(Array.from(extraneous))}`
    );
  }
  if (issues.length) {
    problem(
      `${renovateJson}: "matchPackageNames" in the "OTel Core experimental" group does not match the current set experimental packages from the opentelemetry-js.git repo:\n  - ${issues.join(
        '\n  - '
      )}\nThe "matchPackageNames" should be:\n${JSON.stringify(
        pkgNames.sort(),
        null,
        2
      )}`
    );
  }
}

function getNpmInfo(name) {
  const CACHE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  const cache = ensureCacheLoaded('npmInfo');
  const cacheEntry = cache[name];
  if (cacheEntry) {
    if (cacheEntry.timestamp + CACHE_TIMEOUT_MS > Date.now()) {
      return cacheEntry.value;
    } else {
      delete cache[name];
    }
  }

  // Limited security guard on exec'ing given `name`.
  const PKG_NAME_RE = /^(@[\w_.-]+\/)?([\w_.-]+)$/;
  if (!PKG_NAME_RE.test(name)) {
    throw new Error(
      `${JSON.stringify(name)} does not look like a valid npm package name`
    );
  }

  const stdout = execSync(`npm info -j "${name}"`);
  const npmInfo = JSON.parse(stdout);

  cache[name] = {
    timestamp: Date.now(),
    value: npmInfo,
  };
  saveCache();
  return npmInfo;
}

/**
 * BITROT: Check if instrumentations are missing support for major releases of
 * the target package.
 *
 * Limitations:
 * - This doesn't currently handle both `pg` and `pg-pool` from instr-pg.
 * - This doesn't currently support instr-aws-sdk, because of the wildcard in
 *   the packages supported: `@aws-sdk/client-*`.
 */
function bitrotInstrumentations() {
  const instrReadmes = globSync(
    path.join(TOP, 'packages/instrumentation-*/README.md')
  );

  // Match examples:
  //  - [`undici`](https://www.npmjs.com/package/undici) version `>=5.12.0`
  //  - [`pino`](https://www.npmjs.com/package/pino) versions `>=5.14.0 <10`
  //  - [`tedious`](https://www.npmjs.com/package/tedious) `>=1.11.0 <20`
  //  - [socket.io](https://www.npmjs.com/package/socket.io) versions `>=2.0.0 <5`
  const supVerRe =
    /^###? Supported Versions\n\n*^- \[`?([\w.@/-]+)`?\].* `(.*?)`$/im;

  // Skip some instrumentations for which the supported version range is N/A.
  const SKIP_INSTRS = [
    'user-interaction',
    'long-task',
    'document-load',
    'runtime-node',
    'dns',
    'net',
    'fs',
    'redis-4',
    'aws-sdk',
    'aws-lambda',
  ];

  for (const readmePath of instrReadmes) {
    const instrName = path
      .basename(path.dirname(readmePath))
      .slice('instrumentation-'.length);
    if (SKIP_INSTRS.includes(instrName)) {
      continue;
    }
    const content = fs.readFileSync(readmePath, 'utf8');
    const match = supVerRe.exec(content);
    if (match) delete match.input;
    if (!match) {
      warn(
        `could not determine supported versions from "packages/instrumentation-${instrName}/README.md`
      );
      continue;
    }
    const pkgName = match[1];
    const supVerRange = match[2];

    const npmInfo = getNpmInfo(pkgName);
    const latestVer = npmInfo['dist-tags'].latest;
    if (!satisfies(latestVer, supVerRange)) {
      problem(
        `packages/instrumentation-${instrName}/README.md: the "latest" version of \`${pkgName}\` (${latestVer}) is not supported: the supported range is \`${supVerRange}\``
      );
    }
  }
}

function bitrot() {
  bitrotRenovateCoreExperimental();
  bitrotInstrumentations();
}

// ---- caching

const gCachePath = path.join(BUILD_DIR, 'bitrot.cache.json');
let gCache = null;

function ensureCacheLoaded(ns) {
  if (gCache === null) {
    try {
      gCache = JSON.parse(fs.readFileSync(gCachePath));
    } catch {
      gCache = {};
    }
  }
  if (!(ns in gCache)) {
    gCache[ns] = {};
  }
  return gCache[ns];
}

function saveCache() {
  if (gCache !== null) {
    fs.mkdirSync(path.dirname(gCachePath), { recursive: true });
    fs.writeFileSync(gCachePath, JSON.stringify(gCache, null, 2));
  }
}

// ---- mainline

await bitrot();
if (numProbs > 0) {
  process.exitCode = 1;
}
