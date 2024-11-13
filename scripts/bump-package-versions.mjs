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
  if (pkgInfo.tag) {
    // need to calculate next version
    const commitList = execSync(`git log ${pkgInfo.tag}..HEAD --oneline`, { encoding: 'utf-8' }).split('\n');
    const pkgScope = pkgInfo.name.replace('@opentelemetry/', '');
    const commitsForPackage = commitList.filter((c) => c.indexOf(`(${pkgScope})`) !== -1);

    if (commitsForPackage.length === 0) {
      return;
    }
    console.log(pkgInfo.tag)
    console.log(commitsForPackage)
    const [major, minor, patch] = pkgInfo.version.split('.').map(n => parseInt(n, 10));
    const isExperimental = major === 0;
    const bumpMinor = commitsForPackage.some((cmt) => {
      const pattern = isExperimental ? `(${pkgScope})!:` : `feat(${pkgScope}):`
      return cmt.includes(pattern);
    });
    const bumpMajor = !isExperimental && commitsForPackage.some((cmt) => cmt.includes(`(${pkgScope})!:`));

    let command
    if (bumpMajor) {
      command = 'npm version major';
    } else if (bumpMinor) {
      command = 'npm version minor';
    } else {
      command = 'npm version patch';
    }
    console.log(`executing ${command}`)
    execSync(`${command} --git-tag-version=false`, { cwd: pkgInfo.location });

  } else {
    // is the 1st time so no new version needed
    console.log(pkgInfo.name, 'has no tag')
  }
})
