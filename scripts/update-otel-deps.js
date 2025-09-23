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
 * Update '@opentelemetry/*' deps in all workspaces.
 *
 * Usage:
 *      # You should do a clean 'npm ci' before running this.
 *      node scripts/update-otel-deps.js
 *
 * You can set the `DEBUG=1` envvar to get some debug output.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const globSync = require('glob').sync;
const { minimatch } = require('minimatch');
const semver = require('semver');

const TOP = process.cwd();

function debug(...args) {
    if (process.env.DEBUG) {
        console.log(...args);
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

/**
 * Update dependencies & devDependencies in npm workspaces defined by
 * "./packages.json#packages". Use `patterns` to limit to a set of matching
 * package names.
 *
 * Compare somewhat to dependabot group version updates:
 *  https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file#groups
 * However IME with opentelemetry-js-contrib.git, dependabot will variously
 * timeout, not update all deps, or leave an unsync'd package-lock.json.
 *
 * See https://gist.github.com/trentm/e67fb941a4aca339c2911d873b2e8ab6 for
 * notes on some perils with using 'npm outdated'.
 *
 * @param {object} opts
 * @param {string[]} opts.patterns - An array of glob-like patterns to match
 *      against dependency names. E.g. `["@opentelemetry/*"]`.
 * @param {boolean} [opts.allowRangeBumpFor0x] - By default this update only
 *      targets the latest available version that matches the current
 *      package.json range. Setting this to true allows any deps currently at an
 *      0.x version to be bumped to the latest, even if the latest doesn't
 *      satisfy the current range. E.g. `^0.41.0` will be bumped to `0.42.0` or
 *      `1.2.3` or `2.3.4` if that is the latest published version. This means
 *      using `npm install ...` and changing the range in "package.json".
 * @param {boolean} [opts.dryRun] - Note that a dry-run might not fully
 *      accurately represent the commands run, because the final 'npm update'
 *      args can depend on the results of earlier 'npm install' commands.
 */
function updateNpmWorkspacesDeps({patterns, allowRangeBumpFor0x, dryRun}) {
    assert(
        patterns && patterns.length > 0,
        'must provide one or more patterns'
    );

    const wsDirs = getAllWorkspaceDirs();
    const matchStr = ` matching "${patterns.join('", "')}"`;
    console.log(`Updating deps${matchStr} in ${wsDirs.length} workspace dirs`);

    const depPatternFilter = (name) => {
        if (!patterns) {
            return true;
        }
        for (let pat of patterns) {
            if (minimatch(name, pat)) {
                return true;
            }
        }
        return false;
    };

    // Gather deps info from each of the workspace dirs.
    const pkgInfoFromWsDir = {};
    const localPkgNames = new Set();
    for (let wsDir of wsDirs) {
        const pj = JSON.parse(
            fs.readFileSync(path.join(wsDir, 'package.json'), 'utf8')
        );
        const deps = {};
        if (pj.dependencies) {
            Object.keys(pj.dependencies)
                .filter(depPatternFilter)
                .forEach((d) => {
                    deps[d] = pj.dependencies[d];
                });
        }
        if (pj.devDependencies) {
            Object.keys(pj.devDependencies)
                .filter(depPatternFilter)
                .forEach((d) => {
                    deps[d] = pj.devDependencies[d];
                });
        }
        localPkgNames.add(pj.name);
        pkgInfoFromWsDir[wsDir] = {
            name: pj.name,
            deps,
        };
    }
    debug('pkgInfoFromWsDir: ', pkgInfoFromWsDir);

    console.log('\nGathering info on outdated deps in each workspace:');
    const summaryStrs = new Set();
    const npmInstallTasks = [];
    const npmUpdatePkgNames = new Set();
    wsDirs.forEach((wsDir, i) => {
        console.log(` - ${wsDir} (${i+1} of ${wsDirs.length})`);
        const info = pkgInfoFromWsDir[wsDir];
        const depNames = Object.keys(info.deps);
        if (depNames.length === 0) {
            return;
        }
        // We use 'npm outdated -j ...' as a quick way to get the current
        // installed version and latest published version of deps.
        // Note: The '-j' output with npm@9 shows a limited/random subset of
        // data such that its `wanted` value cannot be used (see "npm outdated"
        // perils above). This has changed with npm@10 such that we might be
        // able to use the `wanted` values now.
        debug(`   $ cd ${wsDir} && npm outdated --json ${depNames.join(' ')}`);
        const p = spawnSync('npm', ['outdated', '--json'].concat(depNames), {
            cwd: wsDir,
            encoding: 'utf8',
        });
        const outdated = JSON.parse(p.stdout);
        if (Object.keys(outdated).length === 0) {
            return;
        }

        const npmInstallArgs = [];
        let npmInstallingALocalDep = false;
        for (let depName of depNames) {
            if (!(depName in outdated)) {
                continue;
            }
            const anOutdatedEntry = Array.isArray(outdated[depName])
              ? outdated[depName][0]
              : outdated[depName];
            const summaryNote = localPkgNames.has(depName) ? ' (local)' : '';
            const currVer = anOutdatedEntry.current;
            const latestVer = anOutdatedEntry.latest;
            if (semver.satisfies(latestVer, info.deps[depName])) {
                // `npm update` should suffice.
                npmUpdatePkgNames.add(depName);
                summaryStrs.add(
                    `${currVer} -> ${latestVer} ${depName}${summaryNote}`
                );
            } else if (semver.lt(currVer, '1.0.0')) {
                if (allowRangeBumpFor0x) {
                    npmInstallArgs.push(`${depName}@${latestVer}`);
                    if (localPkgNames.has(depName)) {
                      npmInstallingALocalDep = true;
                    }
                    summaryStrs.add(
                        `${currVer} -> ${latestVer} ${depName} (range-bump)${summaryNote}`
                    );
                } else {
                    console.warn(
                        `WARN: not updating dep "${depName}" in "${wsDir}" to latest: currVer=${currVer}, latestVer=${latestVer}, package.json dep range="${info.deps[depName]}" (use allowRangeBumpFor0x=true to supporting bumping 0.x deps out of package.json range)`
                    );
                }
            } else {
                // TODO: Add support for finding a release other than latest that satisfies the package.json range.
                console.warn(
                    `WARN: dep "${depName}" in "${wsDir}" cannot be updated to latest: currVer=${currVer}, latestVer=${latestVer}, package.json dep range="${info.deps[depName]}" (this script does not yet support finding a possible published ver to update to that does satisfy the package.json range)`
                );
            }
        }
        if (npmInstallArgs.length > 0) {
            npmInstallTasks.push({
                cwd: wsDir,
                argv: ['npm', 'install'].concat(npmInstallArgs),
            });
            if (npmInstallingALocalDep) {
              // A surprise I've found with 'npm install ...': When the dep
              // being updated (e.g. '@otel/foo@0.1.0' to '@otel/foo@0.2.0')
              // is a *local* dep (i.e. it is another workspace in the same
              // repo) then updating successfully sometimes requires running the
              // 'npm install ...' **twice**.
              npmInstallTasks.push({
                  cwd: wsDir,
                  argv: ['npm', 'install'].concat(npmInstallArgs),
                  comment: 'second time because "npm install"ing a *local* dep can take two tries'
              });
            }
        }
    });

    console.log(
        '\nPerforming updates (%d `npm install ...`s, %d `npm update ...`):',
        npmInstallTasks.length,
        npmUpdatePkgNames.size ? 1 : 0
    );
    debug('npmInstallTasks: ', npmInstallTasks);
    debug('npmUpdatePkgNames: ', npmUpdatePkgNames);
    for (let task of npmInstallTasks) {
        console.log(` $ cd ${task.cwd} && ${task.argv.join(' ')} ${task.comment ? `# ${task.comment}` : ''}`);
        if (!dryRun) {
            const p = spawnSync(task.argv[0], task.argv.slice(1), {
                cwd: task.cwd,
                encoding: 'utf8',
            });
            if (p.error) {
                throw p.error;
            } else if (p.status !== 0) {
                const err = Error(`'npm install' failed (status=${p.status})`);
                err.cwd = task.cwd;
                err.argv = task.argv;
                err.process = p;
                throw err;
            }
            // Note: As noted at https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1917#issue-2109198809
            // (see "... requires running npm install twice ...") in some cases this
            // 'npm install' doesn't actually install the new version, but do not
            // error out!
            // TODO: guard against this with 'npm ls' or package.json check?
        }
    }

    // At this point we should just need a single `npm update ...` command
    // to update the packages that have an available update matching the
    // current package.json ranges.
    //
    // However, there might be transitive deps that prevent `npm update foo`
    // updating to latest unless those transitive deps are included in the
    // command. For example:
    // - workspace "packages/foo" depends on:
    //      "@opentelemetry/host-metrics": "^0.34.1",
    //      "@opentelemetry/resources": "^1.20.0",
    // - currently installed "@opentelemetry/host-metrics@0.34.1" depends on:
    //      "@opentelemetry/sdk-metrics": "^1.8.0"
    // - currently installed "@opentelemetry/sdk-metrics@1.20.0" depends on:
    //      "@opentelemetry/resources": "1.20.0" (note the strict range)
    // - When attempting to update `@opentelemetry/resources` to 1.21.0, it is
    //   implicitly pinned by the `@opentelemetry/sdk-metrics` dep unless the
    //   `npm update ...` command includes `@opentelemetry/sdk-metrics`.
    //
    // We will use `npm outdated ...` to gather all the "Depended by" entries
    // for each `npmUpdatePkgNames` we want to update.
    if (npmUpdatePkgNames.size > 0) {
        const wsDirBasenames = new Set(wsDirs.map((d) => path.basename(d)));
        const p = spawnSync(
            'npm',
            ['outdated', '-p'].concat(Array.from(npmUpdatePkgNames)),
            {cwd: TOP, encoding: 'utf8'}
        );
        // `npm outdated -p` output is:
        //      DIR:WANTED:CURRENT:LATEST:DEPENDED_BY
        // e.g.
        //      % npm outdated @opentelemetry/resources -p
        //      /Users/trentm/src/a-project/node_modules/@opentelemetry/resources:@opentelemetry/resources@1.21.0:@opentelemetry/resources@1.20.0:@opentelemetry/resources@1.21.0:opentelemetry-node
        //      /Users/trentm/src/a-project/node_modules/@opentelemetry/resources:@opentelemetry/resources@1.20.0:@opentelemetry/resources@1.20.0:@opentelemetry/resources@1.21.0:@opentelemetry/sdk-metrics
        // where that "opentelemetry-node" is a workspace dir *basename* (sigh).
        p.stdout
            .trim()
            .split('\n')
            .forEach((line) => {
                const dependedBy = line.split(':')[4];
                if (wsDirBasenames.has(dependedBy)) {
                    return;
                }
                npmUpdatePkgNames.add(dependedBy);
            });

        console.log(` $ npm update ${Array.from(npmUpdatePkgNames).join(' ')}`);
        if (!dryRun) {
            const p = spawnSync(
                'npm',
                ['update'].concat(Array.from(npmUpdatePkgNames)),
                {
                    cwd: TOP,
                    encoding: 'utf8',
                }
            );
            if (p.error) {
                throw p.error;
            }
        }
    }

    console.log('\nSanity check that all matching packages are up-to-date:');
    if (dryRun) {
        console.log('  (Skipping sanity check for dry-run.)');
    } else {
        const allDeps = new Set();
        Object.keys(pkgInfoFromWsDir).forEach((wsDir) => {
            Object.keys(pkgInfoFromWsDir[wsDir].deps).forEach((dep) => {
                allDeps.add(dep);
            });
        });
        console.log(` $ npm outdated ${Array.from(allDeps).join(' ')}`);
        const p = spawnSync('npm', ['outdated'].concat(Array.from(allDeps)), {
            cwd: TOP,
            encoding: 'utf8',
        });
        if (p.status !== 0) {
            // Only *warning* here because the user might still want to commit
            // what *was* updated.
            console.warn(`WARN: not all packages${matchStr} were fully updated:
  *** 'npm outdated' exited non-zero, stdout: ***
  ${p.stdout.trimEnd().split('\n').join('\n  ')}
  ***`);
        }
    }

    // Summary/commit message.
    let commitMsg = `chore(deps): update deps${matchStr}\n\n`;
    commitMsg +=
        '    ' +
        Array.from(summaryStrs)
            .sort((a, b) => {
                const aParts = a.split(' ');
                const bParts = b.split(' ');
                return (
                    semver.compare(aParts[0], bParts[0]) ||
                    (aParts[3] > bParts[3] ? 1 : -1)
                );
            })
            .join('\n    ');
    console.log(
        `\nSummary of changes (possible commit message):\n--\n${commitMsg}\n--`
    );
}

async function main() {
    updateNpmWorkspacesDeps({
        patterns: ['@opentelemetry/*'],
        allowRangeBumpFor0x: true,
        dryRun: false,
    });
}

main();
