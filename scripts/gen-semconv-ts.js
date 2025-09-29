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
 * Generate a "src/semconv.ts" in the given workspace dir, which includes
 * copies of the unstable semconv definitions used in this package.
 * (It finds usages by looking for imports from
 * `@opentelemetry/semantic-conventions/incubating`.)
 *
 * This is to support the recommendation from
 *   https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 * that any usage of unstable Semantic Conventions definitions should be done
 * by *copying* those definitions to a local file in this package.
 *
 * Usage:
 *      node scripts/gen-semconv-ts.js [WORKSPACE-DIR]
 *
 * If WORKSPACE-DIR is not given, it defaults to the current dir.
 */

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const { globSync } = require('glob');
const rimraf = require('rimraf');

const TOP = path.resolve(__dirname, '..');
const BUILD_DIR = path.resolve(TOP, 'build', 'gen-semconv-ts');

const USE_COLOR = process.stdout.isTTY && !process.env.NO_COLOR?.length > 0;

let numWarns = 0;
function warn(...args) {
  numWarns += 1;
  if (USE_COLOR) {
    process.stdout.write('\x1b[31m');
  }
  process.stdout.write('gen-semconv-ts warning: ');
  if (USE_COLOR) {
    process.stdout.write('\x1b[39m');
  }
  console.log(...args);
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

function genSemconvTs(wsDir) {
  const semconvPath = require.resolve('@opentelemetry/semantic-conventions',
      {paths: [path.join(wsDir, 'node_modules')]});
  const semconvStable = require(semconvPath);
  const semconvVer = require(path.resolve(semconvPath, '../../../package.json')).version;

  // Gather unstable semconv imports. Consider any imports from
  // '@opentelemetry/semantic-conventions/incubating' or from an existing local
  // '.../semconv'.
  const srcFiles = globSync(path.join(wsDir, '{src,test}', '**', '*.ts'));
  const importRes = [
    /import\s+{([^}]*)}\s+from\s+'@opentelemetry\/semantic-conventions\/incubating'/s,
    /import\s+{([^}]*)}\s+from\s+'\.[^']*\/semconv'/s,
  ];
  const names = new Set();
  for (const srcFile of srcFiles) {
    const srcText = fs.readFileSync(srcFile, 'utf8');
    for (const importRe of importRes) {
      const match = importRe.exec(srcText);
      if (match) {
        match[1].trim().split(/,/g).forEach(n => {
          n = n.trim();
          if (n) {
            if (semconvStable[n]) {
              warn(`${wsDir}/${srcFile}: '${n}' export is available on the stable "@opentelemetry/semantic-conventions" entry-point. This definition will not be included in the generated semconv.ts. Instead use:\n    import { ${n} } from '@opentelemetry/semantic-conventions';`)
            } else {
              names.add(n);
            }
          }
        });
      }
    }
  }
  if (names.size === 0) {
    console.log(`Did not find any usage of unstable semconv exports in "${wsDir}/{src,test}/**/*.ts".`);
    console.log('No changes made.');
    return;
  } else {
    console.log(`Found import of ${names.size} unstable semconv definitions.`)
  }

  // Find or get a
  let srcIsLocal = false;
  try {
    const gitRemoteUrl = execSync(`git -C "${wsDir}" remote get-url origin`, {encoding: 'utf8'}).trim();
    if (gitRemoteUrl.endsWith('/opentelemetry-js.git')) {
      srcIsLocal = true;
    }
  } catch {}

  // Find or get semconv sources from a opentelemetry-js.git clone.
  let semconvSrcDir;
  if (srcIsLocal) {
    const gitRootDir = execSync(`git -C "${wsDir}" rev-parse --show-toplevel`, {encoding: 'utf8'}).trim();
    semconvSrcDir = path.join(gitRootDir, 'semantic-conventions');
    console.log(`Using local sources at "${semconvSrcDir}"`);
  } else {
    const tag = `semconv/v${semconvVer}`;
    console.log(`Cloning opentelemetry-js.git#${tag} to working dir "${BUILD_DIR}"`);
    rimraf.sync(BUILD_DIR);
    fs.mkdirSync(BUILD_DIR, { recursive: true });
    execSync(`git clone --depth 1 --branch ${tag} https://github.com/open-telemetry/opentelemetry-js.git`, {
      cwd: BUILD_DIR,
      stdio: 'ignore'
    });
    semconvSrcDir = path.join(BUILD_DIR, 'opentelemetry-js', 'semantic-conventions');
    console.log(`Using sources at "${semconvSrcDir}"`);
  }
  const srcPaths = globSync(path.join(semconvSrcDir, 'src', 'experimental_*.ts'));
  const src = srcPaths
    .map(f => fs.readFileSync(f))
    .join('\n\n');

  const sortedNames = Array.from(names).sort();
  const chunks = [];
  for (let name of sortedNames) {
    const re = new RegExp(`^export const ${name} = .*;$`, 'm')
    const match = re.exec(src);
    if (!match) {
      throw new Error(`could not find "${name}" export in semconv build files: ${re} did not match in content from ${srcPaths.join(', ')}`);
    }

    // Find a preceding block comment, if any.
    const WHITESPACE_CHARS = [' ', '\t', '\n', '\r'];
    let idx = match.index - 1;
    while (idx >=1 && WHITESPACE_CHARS.includes(src[idx])) {
      idx--;
    }
    if (src.slice(idx-1, idx+1) !== '*/') {
      // There is not a block comment preceding the export.
      chunks.push(match[0]);
      continue;
    }
    idx -= 2;
    while (idx >= 0) {
      if (src[idx] === '/' && src[idx+1] === '*') {
        // Found the start of the block comment.
        chunks.push(src.slice(idx, match.index) + match[0]);
        break;
      }
      idx--;
    }
  }

  const semconvTsPath = path.join(wsDir, 'src', 'semconv.ts');
  fs.writeFileSync(
    semconvTsPath,
    `/*
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

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

${chunks.join('\n\n')}
`,
    { encoding: 'utf8' }
  );
  console.log(`Generated "${semconvTsPath}".`);

  console.log(`Running 'npx eslint --fix src/semconv.ts' to fix formatting.`);
  execSync(`npx eslint --fix src/semconv.ts`, { cwd: wsDir });
}

// mainline
const wsDir = process.argv[2] || '.';
genSemconvTs(wsDir);
if (numWarns > 0) {
  process.exitCode = 1;
}
