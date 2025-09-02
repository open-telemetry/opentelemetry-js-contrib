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
const execCmd = (cmd, opts = {}) => execSync(cmd, {encoding: 'utf-8', stdio: 'inherit', ...opts});

const pkgInfo = readPkg(ROOT_DIR);
const pkgFiles = pkgInfo.workspaces.map((exp) => globSync(path.join(exp, 'package.json')));
const codecovPath = path.resolve(ROOT_DIR, 'codecov');
const pkgsWithFlag = pkgFiles.flat().map((f) => {
  const path = f.replace('package.json', '');
  const info = readPkg(path);
  const name = info.name;
  const flag = name.replace('@opentelemetry/', '');
  const report = path + 'coverage/coverage-final.json';
  // To get a list of available options run
  // ```
  //   ./codecov --verbose upload-coverage --help
  // ```
  // or check https://docs.codecov.com/docs/cli-options
  const command = [
    './codecov --verbose',
    'upload-coverage',
    '--git-service github',
    // we don't need xcrun or pycoverage plugins
    '--plugin gcov',
    '--gcov-executable gcov',
    '--sha', commitSha,
    '--branch', branchName,
    '--file', report,
    '--flag', flag,
    // limit any scan to the pacakge folder
    '--network-root-folder', path,
    '--dir', path,
    '--dry-run',
  ].join(' ');
  return { name, flag, len: flag.length, path, report, command };
});

// Download codecov-cli if necessary
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
    console.log(`\n\nCODECOV: Uploading report of "${pkg.name}" with flag "${pkg.flag}"\n${pkg.command}`);
    execCmd(pkg.command);
  }
}
