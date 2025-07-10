import path from 'path';
import { readFileSync } from 'fs';
import { globSync } from 'glob';

const readPkg = (dir) => JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));

const TOP = process.cwd();
const pkgInfo = readPkg(TOP);
const pkgFiles = pkgInfo.workspaces.map((exp) => globSync(path.join(exp, 'package.json')));
const pkgFlags = pkgFiles.flat().map((f) => {
  const path = f.replace('package.json', '');
  const info = readPkg(path);
  const name = info.name;
  const flag = name.replace('@opentelemetry/', '');

  return { name, flag, len: flag.length, path };
});

// Print the flags
pkgFlags.forEach((pf) => {
  console.log(`
  ${pf.flag}:
    paths:
      - ${pf.path}
    carryforward: true`)
});