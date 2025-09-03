import { execSync } from 'child_process';
import { globSync } from 'glob';
import { chmodSync, existsSync, readFileSync } from 'fs';
import path from 'path';

// Usage
// node ./scripts/codecov-upload-flags.mjs

const commitSha = process.argv[2];
const branchName = process.argv[3];

const readPkg = (dir) => JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
const pkgInfo = readPkg('.');
const pkgFiles = pkgInfo.workspaces.map((exp) => globSync(path.join(exp, 'package.json')));
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
    '--file', report,
    '--flag', flag,
    // limit any scan to the pacakge folder
    '--dir', path,
  ];

  if (typeof commitSha === 'string') {
    command.push('--sha', commitSha);
  }
  if (typeof branchName === 'string') {
    command.push('--branch', branchName);
  }

  return { name, flag, path, report, command: command.join(' ') };
});

// Download codecov-cli if necessary
const codecovPath = './codecov';
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

const execOpts = {encoding: 'utf-8', stdio: 'inherit'};
if (existsSync(codecovPath)) {
  console.log(`Codecov binary found.`);
} else {
  console.log(`Codecov binary missing. Downloading from ${url}`);
  execSync(`curl -O "${url}"`, execOpts);
  console.log(`Verifying codecov binary downloaded to "${codecovPath}"`);
  execSync(`echo "$(curl -s https://keybase.io/codecovsecurity/pgp_keys.asc)" | gpg --no-default-keyring --import`, execOpts);
  execSync(`curl -O "${url}.SHA256SUM"`, execOpts);
  execSync(`curl -O "${url}.SHA256SUM.sig"`, execOpts);
  execSync(`gpg --verify "codecov.SHA256SUM.sig" "codecov.SHA256SUM"`, execOpts);
}
// make sure we have exec perms
chmodSync(codecovPath, 0o555);

// Compute the commands to run
for (const pkg of pkgsWithFlag) {
  if (existsSync(pkg.report)) {
    console.log(`\n\nCODECOV: Uploading report of "${pkg.name}" with flag "${pkg.flag}"\n${pkg.command}`);
    execSync(pkg.command, execOpts);
  }
}
