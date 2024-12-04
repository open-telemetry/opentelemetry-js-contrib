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
 * Lint the usage of `@opentelemetry/semantic-conventions` in packages in
 * the workspace.
 *
 * See "Rule:" comments for things that are checked.
 *
 * Usage:
 *      node scripts/lint-semconv-deps.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';

const TOP = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SEMCONV = '@opentelemetry/semantic-conventions';
const USE_COLOR = process.stdout.isTTY && !process.env.NO_COLOR?.length > 0;

function problem(...args) {
  if (USE_COLOR) {
    process.stdout.write('\x1b[31m');
  }
  args.unshift('lint-semconv-deps error:')
  console.log(...args);
  if (USE_COLOR) {
    process.stdout.write('\x1b[39m');
  }
}

function getAllWorkspaceDirs() {
  const pj = JSON.parse(
    fs.readFileSync(path.join(TOP, 'package.json'), 'utf8')
  );
  return pj.workspaces
    .map((wsGlob) => globSync(path.join(wsGlob, 'package.json')))
    .flat()
    .map(path.dirname);
}

function lintSemconvDeps() {
  let numProbs = 0;
  const wsDirs = getAllWorkspaceDirs();

  for (let wsDir of wsDirs) {
    const pj = JSON.parse(
      fs.readFileSync(path.join(wsDir, 'package.json'), 'utf8')
    );
    const depRange = pj?.dependencies?.[SEMCONV];
    if (!depRange) {
      continue;
    }

    // Is incubating entry-point in use?
    const srcFiles = globSync(path.join(wsDir, 'src', '**', '*.ts'));
    let usesIncubating = false;
    const usesIncubatingRe = /import \{?[^\{]* from '@opentelemetry\/semantic-conventions\/incubating'/s;
    for (let srcFile of srcFiles) {
      const srcText = fs.readFileSync(srcFile, 'utf8');
      const match = usesIncubatingRe.exec(srcText);
      if (match) {
        usesIncubating = true;
        break;
      }
    }

    // Rule: If the semconv "incubating" entry-point is used, then the dep
    // should be pinned. Otherwise it should not be pinned.
    const pinnedVerRe = /^\d+\.\d+\.\d+$/;
    const pins = Boolean(pinnedVerRe.exec(depRange));
    if (usesIncubating) {
      if (!pins) {
        problem(`package ${pj.name} (in ${wsDir}) imports "${SEMCONV}/incubating" but does not *pin* the dependency: \`"${SEMCONV}": "${depRange}"\``);
        numProbs += 1;
      }
    } else {
      if (pins) {
        problem(`package ${pj.name} (in ${wsDir}) does not import "${SEMCONV}/incubating" but pins the dependency: \`"${SEMCONV}": "${depRange}"\` (it could use a caret-range)`);
        numProbs += 1;
      }
    }
  }

  return numProbs;
}

// mainline
const numProbs = await lintSemconvDeps();
if (numProbs > 0) {
  process.exitCode = 1;
}

