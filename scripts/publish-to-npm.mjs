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
 * Replacement for: lerna publish from-package --no-push --no-private --no-git-tag-version --no-verify-access --yes
 * Workflow line: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/c67a8c3e096b835e3eb91cac0642bf775ffa4350/.github/workflows/release-please.yml#L84
 * Ref: https://github.com/lerna/lerna/tree/main/commands/publish#bump-from-package
 * 
 * Usage: node ./scripts/publish-to-npm.mjs
 * 
 * - [X] checks package versions directly from the `pacakge.json` files (from-package)
 * - [X] filters out all private repos (--no-private)
 * - [X] does not create tags o push anything (--no-push & --no-git-tag-version)
 * - [X] does not do any extra request to verify access tokens (--no-verify-access)
 * - [X] does not ask for confirmation (--yes)
 */

import { exec } from 'child_process';
import path from 'path';
import { readFileSync } from 'fs';
import { globSync } from 'glob';

const readJson = (filePath) => {
	return JSON.parse(readFileSync(filePath));
};
const execCommand = (cmd, options = {}) => {
  return new Promise((res, rej) => {
    exec(cmd, options, (err, stdout, stderr) => {
      if (err) {
        rej(stderr);
      } else {
        res(stdout);
      }
    });
  });
};

// Check data from packages (former lerna --from-package option)
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
const publicPkgVersions = await Promise.all(publicPkgList.map(async (pkg) => {
  const infoText = await execCommand(`npm info ${pkg.name} --json time`);
  return JSON.parse(infoText);
}));

const publishTasks = [];
publicPkgList.forEach((pkg, idx) => {
  const versions = new Set(Object.keys(publicPkgVersions[idx]));

  // Add tasks if no version matches the current
  if (!versions.has(pkg.version)) {
    publishTasks.push({ cmd: 'npm publish', opts: { cwd: pkg.location} });
  }
});

// For better logging we may want to publish packages sequentially
for (const task of publishTasks) {
  console.log(`Publishing package ${pkg.name} with version ${pkg.version}`);
  await execCommand(task.cmd, task.opts);
}