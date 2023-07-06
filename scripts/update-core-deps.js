/*!
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
 * Update all dependencies from the core repo to the @next tag versions
 * 
 * To use the script, run it from the root of the contrib repository like this:
 *  `node scripts/update-core-deps.js`
 * 
 * If your core repository is checked out in the same directory as your contrib
 * repository with the default name, it will be found automatically. If not,
 * you can point to the core repository with the environment variable
 * CORE_REPOSITORY like this:
 *  `CORE_REPOSITORY=../../otel-core node scripts/update-core-deps.js
 * 
 * Note that this only updates the versions in the package.json for each package
 * and you will still need to run `npm run compile` and make any necessary
 * code changes.
 */

"use strict";

const path = require('path');
const fs = require('fs');
const child_process = require('child_process')

// Use process.env.CORE_REPOSITORY to point to core repository directory
// Defaults to ../opentelemetry-js
let coreDir = path.join(process.cwd(), '..', 'opentelemetry-js');
if (process.env.CORE_REPOSITORY) {
    coreDir = path.resolve(process.env.CORE_REPOSITORY);
}

if (!fs.existsSync(path.join(coreDir, "lerna.json"))) {
    console.error(`Missing lerna.json in ${coreDir}`);
    console.error("Be sure you are setting $CORE_REPOSITORY to a valid lerna monorepo");
    process.exit(1);
}

async function main() {
    const corePackageList = await getCorePackages();
    const contribPackageLocations = await getContribPackageLocations();

    for (const packageLocation of contribPackageLocations) {
        let changed = false;
        const packageJson = require(packageLocation);
        console.log('Processing', packageJson.name);

        for (const type of ["dependencies", "devDependencies", "peerDependencies"]) {
            const changedForType = updateDeps(packageJson, type, corePackageList);
            changed = changed || changedForType;
        }

        if (changed) {
            console.log('Package changed. Writing new version.');
            fs.writeFileSync(packageLocation, JSON.stringify(packageJson, null, 2) + '\n');
        } else {
            console.log('No change detected');
        }

        console.log();
    }
}

function updateDeps(packageJson, type, corePackageList) {
    if (!packageJson[type]) {
        return false;
    }

    console.log("\t", type)
    let changed = false;
    for (const corePackage of corePackageList) {
        const oldCoreVersion = packageJson[type][corePackage.name];
        if (oldCoreVersion) {
            const newVersion = `${getVersionLeader(oldCoreVersion)}${corePackage.nextVersion}`;
            console.log('\t\t', corePackage.name);
            console.log('\t\t\t', oldCoreVersion, '=>', newVersion)
            packageJson[type][corePackage.name] = newVersion;
            changed = true;
        }
    }
    return changed;
}

async function getContribPackageLocations() {
    const gitContribPackageLocations = await exec('git ls-files');
    return gitContribPackageLocations
        .split(/\r?\n/)
        .filter(f => f.match(/package\.json$/))
        .map(f => path.resolve(f));
}

async function getCorePackages() {
    const coreLernaList = await exec('lerna list --no-private --json', coreDir);
    return Promise.all(
        JSON.parse(coreLernaList)
            .map(async p => {
                const nextVersion = await exec(`npm view ${p.name}@next version`);
                return {
                    ...p,
                    nextVersion: nextVersion.trim(),
                };
            })
    );
}

function getVersionLeader(version) {
    if (version.match(/^\d/)) {
        return '';
    }

    return version[0];
}

async function exec(cmd, dir) {
    return new Promise((resolve, reject) => {
        child_process.exec(cmd, {
            cwd: dir
        }, function (err, stdout) {
            if (err) {
                reject(err);
            } else {
                resolve(stdout);
            }
        });
    })
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
