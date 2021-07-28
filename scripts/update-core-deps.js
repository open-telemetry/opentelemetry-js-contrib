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

const path = require('path');
const fs = require('fs');
const child_process = require('child_process')

/**
 * Update all dependencies from the core repo to the @next tag versions
 */

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
        const package = require(packageLocation);
        console.log('Processing', package.name);

        for (const type of ["dependencies", "devDependencies", "peerDependencies"]) {
            changed = changed || updateDeps(package, type, corePackageList);
        }

        if (changed) {
            console.log('Package changed. Writing new version.');
            fs.writeFileSync(packageLocation, JSON.stringify(package, null, 2) + '\n');
        } else {
            console.log('No change detected');
        }

        console.log();
    }
}

function updateDeps(package, type, corePackageList) {
    if (!package[type]) {
        return false;
    }

    console.log("\t", type)
    let changed = false;
    for (const corePackage of corePackageList) {
        const oldCoreVersion = package[type][corePackage.name];
        if (oldCoreVersion) {
            const newVersion = `${getVersionLeader(oldCoreVersion)}${corePackage.nextVersion}`;
            console.log('\t\t', corePackage.name);
            console.log('\t\t\t', oldCoreVersion, '=>', newVersion)
            package[type][corePackage.name] = newVersion;
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
