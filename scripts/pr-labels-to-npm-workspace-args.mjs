/**
 * Formats `-w WORKSPACE` arguments for `npm run` from "pkg:"-prefixed labels.
 * Takes a JSON string as an argument and returns the formatted args in stdout.
 *
 * arg: '["pkg:instrumentation-pino", "urgent", "pkg:instrumentation-fs"]'
 * stdout: '-w @opentelemetry/instrumentation-pino -w @opentelemetry/instrumentation-fs'
 */

const labels = JSON.parse(process.argv[2]);

console.error('Labels:', labels);

const workspaces = labels
  .filter((l) => {
    return l.startsWith('pkg:');
  })
  .map((l) => {
    return l.replace(/^pkg:/, '@opentelemetry/');
  });

console.error('Workspaces:', workspaces);

console.log(workspaces.map((w) => { return `-w ${w}`; }).join(' '));
