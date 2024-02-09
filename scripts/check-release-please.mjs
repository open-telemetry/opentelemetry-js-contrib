import { strict as assert } from 'assert';
import * as childProcess from 'child_process';
import path from 'path';
import { readFileSync } from 'fs';

/*
	Enumerates through

	- lerna packages,
	- release please's manifest, and
	- release please's config, and

	makes sure all those lists are in sync. If not, guides you to do the correct thing
*/

const errors = [];
const logErrorIf = (condition, errorMessage) => {
	if (condition) {
		errors.push(errorMessage);
	}
};
const PROJECT_ROOT = process.cwd();
const readJson = (filePath) => {
	return JSON.parse(readFileSync(filePath));
};
const getProcessOutput = (cmd, args) => {
	const result = childProcess.spawnSync(cmd, args);
	assert(!result.error, result.error);
	return result.stdout.toString('utf8');
}

const lernaList = JSON
	.parse(getProcessOutput('npx', ['lerna', 'list', '--json', '-a']))
	.map((pkgInfo) => {
		pkgInfo.relativeLocation = path.relative(PROJECT_ROOT, pkgInfo.location);
		return pkgInfo;
	});
const manifest = readJson('.release-please-manifest.json');
const config = readJson('release-please-config.json');

const lernaPackages = new Set(
  lernaList.map((pkgInfo) => pkgInfo.relativeLocation)
);
const manifestPackages = new Set(Object.keys(manifest));
const configPackages = new Set(Object.keys(config.packages));

lernaList.forEach((pkgInfo) => {
  const relativeLocation = pkgInfo.relativeLocation
  if (pkgInfo.private) {
    // Should be in config, with `skip-github-release` option.
    const configEntry = config.packages[relativeLocation]
    if (!configEntry) {
      errors.push(`Could not find "${relativeLocation}" entry in release-please-config.json. If you are adding a new package. Add following to "packages" object:
    "${relativeLocation}": { "skip-github-release": true },`);
    } else if (configEntry['skip-github-release'] !== true) {
      errors.push(`The "${relativeLocation}" entry in release-please-config.json should have the '"skip-github-release": true' option`);
    }
  } else {
    // Should be in manifest and config.
    logErrorIf(
      !manifestPackages.has(relativeLocation),
      `Could not find "${relativeLocation}" entry in .release-please-manifest.json. If you are adding a new package. Add following
    "${relativeLocation}": "0.0.1",`);

    logErrorIf(
      !configPackages.has(relativeLocation),
      `Could not find "${relativeLocation}" entry in release-please-config.json. If you are adding a new package. Add following to "packages" object
    "${relativeLocation}": {},`);
  }
});

manifestPackages.forEach((relativeLocation) => {
	logErrorIf(
		!lernaPackages.has(relativeLocation),
		`Extraneous path ${relativeLocation} in .release-please-manifest.json`
	);
});

configPackages.forEach((relativeLocation) => {
	logErrorIf(
		!lernaPackages.has(relativeLocation),
		`Extraneous path ${relativeLocation} in release-please-config.json`
	);
});

if (errors.length) {
	console.error('Errors occured:\n');
	console.error(errors.join('\n\n'));
	process.exit(1);
} else {
	console.error('OK');
}
