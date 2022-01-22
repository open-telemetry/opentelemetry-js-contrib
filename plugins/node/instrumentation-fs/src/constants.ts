/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type * as fs from 'fs';

// extract the type of any property

export const SYNC_FUNCTIONS: (keyof typeof fs)[] = [
  'accessSync',
  'appendFileSync',
  'chmodSync',
  'chownSync',
  'closeSync',
  'copyFileSync',
  // 'cpSync',
  'existsSync',
  'fchmodSync',
  'fchownSync',
  'fdatasyncSync',
  'fstatSync',
  'fsyncSync',
  'ftruncateSync',
  'futimesSync',
  'lchownSync',
  'linkSync',
  'lstatSync',
  'lutimesSync',
  'mkdirSync',
  'mkdtempSync',
  'opendirSync',
  'openSync',
  'readdirSync',
  'readFileSync',
  'readlinkSync',
  'readSync',
  'readvSync',
  'realpathSync',
  'renameSync',
  'rmdirSync',
  'rmSync',
  'statSync',
  'symlinkSync',
  'truncateSync',
  'unlinkSync',
  'utimesSync',
  'writeFileSync',
  'writeSync',
  'writevSync',
];

export const ASYNC_FUNCTIONS: (keyof typeof fs)[] = [
  'access',
  'appendFile',
  'chmod',
  'chown',
  'close',
  'copyFile',
  // 'cp',
  'exists',
  'fchmod',
  'fchown',
  'fdatasync',
  'fstat',
  'fsync',
  'ftruncate',
  'futimes',
  'lchown',
  'link',
  'lstat',
  'lutimes',
  'mkdir',
  'mkdtemp',
  'open',
  'opendir',
  'read',
  'readdir',
  'readFile',
  'readlink',
  'readv',
  'realpath',
  'rename',
  'rm',
  'rmdir',
  'stat',
  'symlink',
  'truncate',
  'unlink',
  'utimes',
  'write',
  'writeFile',
  'writev',
];
