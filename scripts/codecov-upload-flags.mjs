import { execSync } from 'child_process';
import { globSync } from 'glob';
import { chmodSync, existsSync, readFileSync } from 'fs';
import path from 'path';

const branchName = process.argv[2];
const commitSha = process.argv[3];

if (typeof branchName !== 'string') {
  console.log('Branch name missing! Exiting');
  process.exit(-1);
}
if (typeof commitSha !== 'string') {
  console.log('Commit sha missing! Exiting');
  process.exit(-1);
}

const ROOT_DIR = process.cwd();
const readPkg = (dir) => JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
const execCmd = (cmd, opts = {}) => execSync(cmd, {cwd: process.cwd(), encoding: 'utf-8', stdio: 'inherit', ...opts});

const pkgInfo = readPkg(ROOT_DIR);
const pkgFiles = pkgInfo.workspaces.map((exp) => globSync(path.join(exp, 'package.json')));
const codecovPath = path.resolve(ROOT_DIR, 'codecov');
const pkgsWithFlag = pkgFiles.flat().map((f) => {
  const path = f.replace('package.json', '');
  const info = readPkg(path);
  const name = info.name;
  const flag = name.replace('@opentelemetry/', '');
  const report = path + 'coverage/coverage-final.json';
  // NOTE: command extracted fromt the codecov action. You can see an example in
  // https://github.com/open-telemetry/opentelemetry-js-contrib/actions/runs/17320649481/job/49176411722?pr=2866
  //
  // Example:
  // ./codecov --verbose upload-coverage --git-service github --sha f08e6cceec6f39d61b1a9c35aed2e53b54a55d36 --branch david-luna:dluna-ci-pr-speed-and-coverage --gcov-executable gcov
  const command = [
    './codecov --verbose',
    'upload-coverage',
    '--git-service github',
    '--gcov-executable gcov',
    '--sha', commitSha,
    '--branch', branchName,
    '--dry-run',
  ].join(' ');
  return { name, flag, len: flag.length, path, report, command };
});

// Download codecov
const baseUrl = 'https://cli.codecov.io/latest/';
const urlMap = {
  linux: `${baseUrl}linux/codecov`,
  darwin: `${baseUrl}macos/codecov`,
};

const url = urlMap[process.platform];
if (!url) {
  console.log(`No codecov binary available for platform "${process.platform}"`);
  console.log(`Available platforms are "${Object.keys(urlMap)}"`);
  process.exit(-1);
}

// Download CLI tool if needed
if (existsSync(codecovPath)) {
  console.log(`Codecov binary found.`);
} else {
  console.log(`Codecov binary missing. Downloading from ${url}`);
  execCmd(`curl -O "${url}"`);
  console.log(`Verifying codecov binary downloaded to ${codecovPath}`);
  execCmd(`echo "$(curl -s https://keybase.io/codecovsecurity/pgp_keys.asc)" | gpg --no-default-keyring --import`);
  execCmd(`curl -O "${url}.SHA256SUM"`);
  execCmd(`curl -O "${url}.SHA256SUM.sig"`);
  execCmd(`gpg --verify "${codecovPath}.SHA256SUM.sig" "${codecovPath}.SHA256SUM"`);
}
// make sure we have exec perms
chmodSync(codecovPath, 0o555);

// Compute the commands to run
for (const pkg of pkgsWithFlag) {
  if (existsSync(pkg.report)) {
    console.log(`CODECOV: Uploading report of "${pkg.name}" with flag "${pkg.flag}"\n\n`);
    const command = pkg.command.replace('<sha>', 'Oxffff').replace('<branch>', 'my-branch');
    execCmd(command);
  }
}
