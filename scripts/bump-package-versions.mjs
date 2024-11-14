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

import { exec, execSync } from 'child_process';
import path from 'path';
import { readFileSync } from 'fs';
import { globSync } from 'glob';

// -- Utility functions --
// TODO: move this into a common file
const readJson = (filePath) => {
	return JSON.parse(readFileSync(filePath));
};

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

const getCommitsFrom = (commitOrTag) => {
  return execSync(`git log ${commitOrTag}..HEAD --oneline`, { encoding: 'utf-8' }).split('\n');
}

const getScopedCommitsFrom = (scope, commitOrTag) => {
  const commits = execSync(`git log ${commitOrTag}..HEAD --oneline`, { encoding: 'utf-8' }).split('\n');

  return commits.filter((c) => c.indexOf(`(${scope})`) !== -1);
}

// -- Main line
const publicPkgList = getPackages().filter(pkg => !pkg.private);
const repoTags = execSync('git tag', { encoding: 'utf-8' }).split('\n');

// Set the latest tag on each package
repoTags.forEach((tag) => {
  const nameParts = tag.split('-');
  const version = nameParts.pop();
  const pkgName = `@opentelemetry/${nameParts.join('-')}`;
  const pkgInfo = publicPkgList.find((pkg) => pkg.name === pkgName);

  // Assumption: `git tag` rueturs tags from old to new so we care about
  // the last occurrence
  if (pkgInfo) {
    pkgInfo.tag = tag;
  }
});

// Check for commits on each package
// Assumption: current version is latest on npm (so no checking it)
publicPkgList.forEach((pkgInfo) => {
  const pkgScope = pkgInfo.name.replace('@opentelemetry/', '');

  if (pkgInfo.tag) {
    const scopedCommits = getScopedCommitsFrom(pkgScope, pkgInfo.tag);

    if (scopedCommits.length === 0) {
      return;
    }

    const isExperimental = pkgInfo.version.startsWith('0.');
    const bumpMinor = scopedCommits.some((cmt) => {
      const pattern = isExperimental ? `(${pkgScope})!:` : `feat(${pkgScope}):`
      return cmt.includes(pattern);
    });
    const bumpMajor = !isExperimental && scopedCommits.some((cmt) => cmt.includes(`(${pkgScope})!:`));
    const bumpType = bumpMajor ? 'major' : (bumpMinor ? 'minor' : 'patch');

    console.log(`Bumping ${bumpType} version in ${pkgInfo.name}`);
    execSync(`npm version ${bumpType} --git-tag-version=false`, { cwd: pkgInfo.location });

  } else {
    // NOTE: this could be one of two scenairios
    // - new package
    // - package being moved here like @opentelemetry/propagator-aws-xray-lambda
    console.log(pkgInfo.name, 'has no tag');
    let isNewPkg = false;
    let versions;
    try {
      versions = JSON.parse(
        execSync(`npm info ${pkgInfo.name} --json time`, { encoding: 'utf-8' })
      );
    } catch (err) {
      console.log(`*********\n${err.message}\n********`)
      isNewPkg = err.message.includes('npm ERR! 404 Not Found - GET');
    }


    if (isNewPkg) {
      console.log(pkgInfo.name, 'is not in the registry. No bump needed');
    } else {
      // - assume version is the last in npm
      // - find the commit where it was added
      // - check for commits since then, and do the calculation
      const addCommit = execSync(`git log --diff-filter=A -- ${pkgInfo.location}/package.json`, { encoding: 'utf-8' });
      const commitSha = addCommit.substring(7, 14);
      const scopedCommits = getScopedCommitsFrom(pkgScope, commitSha);
      
      console.log(`Package ${pkgInfo.name} was added in ${commitSha}`);
  
      const isExperimental = pkgInfo.version.startsWith('0.');
      const bumpMinor = scopedCommits.some((cmt) => {
        const pattern = isExperimental ? `(${pkgScope})!:` : `feat(${pkgScope}):`
        return cmt.includes(pattern);
      });
      const bumpMajor = !isExperimental && scopedCommits.some((cmt) => cmt.includes(`(${pkgScope})!:`));
      const bumpType = bumpMajor ? 'major' : (bumpMinor ? 'minor' : 'patch');
  
      console.log(`Bumping ${bumpType} version in ${pkgInfo.name}`);
      execSync(`npm version ${bumpType} --git-tag-version=false`, { cwd: pkgInfo.location });
    }
  }
})
