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

const lernaList = JSON.parse(
getProcessOutput('lerna', ['list', '--json'])
);
const packageList = new Map(
	lernaList.map((pkg) => {
		const relativeLocation = path.relative(PROJECT_ROOT, pkg.location);
		return [relativeLocation, { ...pkg, relativeLocation: path.relative(PROJECT_ROOT, pkg.location) }];
	})
);
const manifest = readJson('.release-please-manifest.json');
const config = readJson('release-please-config.json');

const manifestPackages = new Set(Object.keys(manifest));
const configPackages = new Set(Object.keys(config.packages));

console.log('lerna packages', );
console.log('manifest packages', manifestPackages);
console.log('config packages', configPackages);

packageList.forEach(({ relativeLocation }) => {
	logErrorIf(
		!manifestPackages.has(relativeLocation),
		`Could not find ${relativeLocation} from manifest. If you are adding a new package. Add following to .release-please-manifest.json
  "${relativeLocation}": "0.0.1",`);

	logErrorIf(
		!configPackages.has(relativeLocation),
		`Could not find ${relativeLocation} from config. If you are adding a new package. Add following to release-please-config.json under packages
  "${relativeLocation}": {},`);

});

manifestPackages.forEach((relativeLocation) => {
	logErrorIf(
		!packageList.has(relativeLocation),
		`Extraneous path ${relativeLocation} in .release-please-manifest.json`
	);
});

configPackages.forEach((relativeLocation) => {
	logErrorIf(
		!packageList.has(relativeLocation),
		`Extraneous path ${relativeLocation} in release-please-config.json`
	);
});

if (errors.length) {
	console.error('Errors occured:');
	console.error(errors.join('\n\n'));
	process.exit(1);
}
