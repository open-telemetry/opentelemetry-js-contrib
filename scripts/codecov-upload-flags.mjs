import { execSync } from 'child_process';
import { globSync } from 'glob';
import { chmod, chmodSync, createWriteStream, existsSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';

const readPkg = (dir) => JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
const download = async (url, dst) => {
  const resp = await fetch(url);
  return new Promise((res, rej) => {
    if (resp.ok && resp.body) {
      console.log("Writing to file:", dst);
      let writer = createWriteStream(dst);
      Readable.fromWeb(resp.body).pipe(writer);
      writer.on('finish', res);
      writer.on('error', rej);
    } else {
      rej(new Error('Could not get body from request'));
    }
  });
};

const TOP = process.cwd();
const pkgInfo = readPkg(TOP);
const pkgFiles = pkgInfo.workspaces.map((exp) => globSync(path.join(exp, 'package.json')));
const codecovPath = path.resolve(TOP, 'codecov');
const pkgsWithFlag = pkgFiles.flat().map((f) => {
  const path = f.replace('package.json', '');
  const info = readPkg(path);
  const name = info.name;
  const flag = name.replace('@opentelemetry/', '');
  const report = path + 'coverage/coverage-final.json';
  const command = `./codecov do-upload -t <token> -f ${report} --disable-search -F ${flag} -d`;
  return { name, flag, len: flag.length, path, report, command };
});

// Download codecov
const urlMap = {
  linux: 'https://cli.codecov.io/latest/linux/codecov',
  darwin: 'https://cli.codecov.io/latest/macos/codecov',
};
const url = urlMap[process.platform];
const token = process.argv[2];
// Validations
if (typeof token !== 'string') {
  console.log('Token is missing. Usage:');
  console.log('node ./scripts/codecov-upload-flags.mjs my-codecov-token');
  process.exit(-1); 
}
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
  await download(url, codecovPath);
  console.log(`Codecov binary downloaded to ${codecovPath}`);
}
// make sure we have exec perms
chmodSync(codecovPath, 0o555);

// Compute the commands to run
for (const pkg of pkgsWithFlag) {
  if (existsSync(pkg.report)) {
    const command = pkg.command.replace('<token>', token)
    console.log(`Uploading report of ${pkg.name} with flag ${pkg.flag}`);
    execSync(command, {cwd: TOP, encoding: 'utf-8'});
  } else {
    console.log(`Report of ${pkg.name} not found. Expected existence of ${pkg.report}`);
  }
}
