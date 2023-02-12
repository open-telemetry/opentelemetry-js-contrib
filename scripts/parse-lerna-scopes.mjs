import * as childProcess from 'child_process';
import { join } from 'path';
import { readFileSync } from 'fs';

/*
	Formats `--scope` arguments for lerna from "pkg:"-prefixed labels.
	Takes a JSON string as an argument and returns the formatted args in stdout.
	Filters out packages that do not have test-all-versions script because it's the only
		location we are using this script.

	arg: '["pkg:404", "pkg:", "pkg:instrumentation-pino", "pkg:instrumentation-dns", "pkg:instrumentation-express", "urgent", "pkg:instrumentation-fs"]'
	stdout: '--scope @opentelemetry/instrumentation-pino --scope @opentelemetry/instrumentation-express'
*/

const labels = JSON.parse(process.argv[2]);
const lernaList = JSON.parse(
	childProcess.spawnSync('lerna', ['list', '--json']).stdout
		.toString('utf8')
);
const packageList = new Map(
	lernaList.map((pkg) => {
		return [pkg.name, pkg];
	})
);
// Checking this is not strictly required, but saves the whole setup for TAV workflows
const hasTavScript = (pkgLocation) => {
	const { scripts } = JSON.parse(readFileSync(join(pkgLocation, 'package.json')));
	return !!scripts['test-all-versions'];
};

console.error('Labels:', labels);
console.error('Packages:', [...packageList.keys()]);

const scopes = labels
		.filter((l) => {
			return l.startsWith('pkg:');
		})
		.map((l) => {
			return l.replace(/^pkg:/, '@opentelemetry/');
		})
		.filter((pkgName) => {
			const info = packageList.get(pkgName);
			if (!info) {
				return false
			}
			return hasTavScript(info.location);
		})

console.error('Scopes:', scopes);

console.log(
	scopes.map((scope) => {
		return `--scope ${scope}`;
	})
	.join(' ')
);
