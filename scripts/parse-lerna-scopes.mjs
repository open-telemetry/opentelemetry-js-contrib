import * as childProcess from 'child_process';

/*
	Formats `--scope` arguments for lerna from "pkg:"-prefixed labels.
	Takes a JSON string as an argument and returns the formatted args in stdout.

	arg: '["pkg:404", "pkg:", "pkg:instrumentation-dns", "pkg:instrumentation-fs", "urgent", "pkg:instrumentation-fs"]'
	stdout: '--scope @opentelemetry/instrumentation-dns --scope @opentelemetry/instrumentation-fs'
*/

const labels = JSON.parse(process.argv[2]);
const packageList = new Set(
	childProcess.spawnSync('lerna', ['list']).stdout
		.toString('utf8')
		.split('\n')
);

console.error('Labels:', labels);
console.error('Packages:', [...packageList]);

const scopes = labels
		.filter((l) => {
			return l.startsWith('pkg:');
		})
		.map((l) => {
			return l.replace(/^pkg:/, '@opentelemetry/');
		})
		.filter((pkgName) => {
			return packageList.has(pkgName);
		})

console.error('Scopes:', scopes);

console.log(
	scopes.map((scope) => {
		return `--scope ${scope}`;
	})
	.join(' ')
);
