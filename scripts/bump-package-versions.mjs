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
 * Bumps the package versions according the the git commits present
 * after the latest tag of the package
 */

import { execSync } from 'child_process';
import path from 'path';
import { readFileSync } from 'fs';
import { globSync } from 'glob';

/**
 * @typedef {Object} PkgInfo
 * @property {string} version
 * @property {string} name
 * @property {string} location
 * @property {string} [tag]
 */

// -- Utility functions --
// TODO: move this into a common file
/**
 * @param {string} filePath 
 * @returns {Object}
 */
const readJson = (filePath) => {
	return JSON.parse(readFileSync(filePath));
};

/**
 * @returns {PkgInfo[]}
 */
const getPackages = () => {
	const TOP = process.cwd();
	const pj = readJson(path.join(TOP, 'package.json'));
	return pj.workspaces
		.map((wsGlob) => globSync(path.join(wsGlob, 'package.json')))
		.flat()
		.map((p) => {
			const pkgInfo = readJson(p);
			pkgInfo.location = path.dirname(p);
			return pkgInfo;
		});
}

/**
 * @param {PkgInfo} pkgInfo 
 * @param {string} commitOrTag 
 * @returns 
 */
const getPkgCommitsFrom = (pkgInfo, commitOrTag) => {
  const command = `git log ${commitOrTag}..HEAD --oneline ${pkgInfo.location}`;
  const commits = execSync(command,{ encoding: 'utf-8' }).split('\n');

  return commits;
}

/**
 * @param {PkgInfo} pkgInfo 
 * @param {string[]} commits
 * @returns {'major' | 'minor' | 'patch'}
 */
const getBumpType = (pkgInfo, commits) => {
  const isExperimental = pkgInfo.version.startsWith('0.');
  let bumpType = 'patch';
  console.log('isExperimental', isExperimental)
  for (const commit of commits) {
    // commit must be in the proper format
    if (commit.indexOf(':') === -1) {
      continue;
    }
    const commitPrefix = commit.split(':').shift().trim();
    const isBreaking = commitPrefix.endsWith('!');
    const isFeature = commitPrefix.includes('feat');

    // Experimental only accpets patch & minor
    if (isExperimental && (isBreaking || isFeature)) {
      return 'minor';
    }

    // Stable could be also major
    if (!isExperimental) {
      if (isBreaking) {
        return 'major';
      }
      if (isFeature) {
        bumpType = 'minor';
      }
    }
  }
  return bumpType;
};

// -- Main line
const publicPkgList = getPackages().filter(pkg => !pkg.private);
const repoTags = execSync('git tag', { encoding: 'utf-8' }).split('\n');

// Set the latest tag on each package
repoTags.forEach((tag) => {
  const nameParts = tag.split('-').slice(0, -1);
  const pkgName = `@opentelemetry/${nameParts.join('-')}`;
  const pkgInfo = publicPkgList.find((pkg) => pkg.name === pkgName);

  // Assumption: `git tag` returns tags from old to new so we care about
  // the last occurrence
  if (pkgInfo) {
    pkgInfo.tag = tag;
  }
});

// Check for commits on each package
// Assumption: current version is latest on npm (so no checking it)
publicPkgList.forEach((pkgInfo) => {
  if (pkgInfo.tag) {
    const scopedCommits = getPkgCommitsFrom(pkgInfo, pkgInfo.tag);

    if (scopedCommits.length === 0) {
      return;
    }

    const bumpType = getBumpType(pkgInfo, scopedCommits);
    console.log(`Bumping ${bumpType} version in ${pkgInfo.name}`);
    execSync(`npm version ${bumpType} --git-tag-version=false`, { cwd: pkgInfo.location });
  } else {
    // NOTE: this could be one of two scenairios
    // - new package
    // - package being moved here like @opentelemetry/propagator-aws-xray-lambda
    console.log(`"${pkgInfo.name}" has no tag`);
    let isNewPkg = false;
    let versions;
    try {
      versions = JSON.parse(
        execSync(`npm info ${pkgInfo.name} --json time`, { encoding: 'utf-8' })
      );
    } catch (err) {
      // We get an error for new a new package. Throw other type of errors
      isNewPkg = err.message.includes('npm ERR! 404 Not Found - GET');
      if (!isNewPkg) {
        throw err;
      }
    }

    if (isNewPkg) {
      console.log(`"${pkgInfo.name}" is not in the registry. No bump needed`);
    } else {
      // - assume version is the last in npm
      // - find the commit where it was added
      // - check for commits since then, and do the calculation
      const addCommit = execSync(`git log --diff-filter=A -- ${pkgInfo.location}/package.json`, { encoding: 'utf-8' });
      const commitSha = addCommit.substring(7, 14);
      const scopedCommits = getPkgCommitsFrom(pkgInfo, commitSha);
      
      console.log(`Package ${pkgInfo.name} was added in ${commitSha}`);
      const bumpType = getBumpType(pkgInfo, scopedCommits);
      console.log(`Bumping ${bumpType} version in ${pkgInfo.name}`);
      execSync(`npm version ${bumpType} --git-tag-version=false`, { cwd: pkgInfo.location });
    }
  }
});
