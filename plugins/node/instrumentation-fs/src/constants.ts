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

import type { FMember, FPMember } from './types';

export const PROMISE_FUNCTIONS: FPMember[] = [
  'access',
  'appendFile',
  'chmod',
  'chown',
  'copyFile',
  'cp' as FPMember, // added in v16
  'lchown',
  'link',
  'lstat',
  'lutimes', // added in v12
  'mkdir',
  'mkdtemp',
  'open',
  'opendir', // added in v12
  'readdir',
  'readFile',
  'readlink',
  'realpath',
  'rename',
  'rm', // added in v14
  'rmdir',
  'stat',
  'symlink',
  'truncate',
  'unlink',
  'utimes',
  'writeFile',
  // 'lchmod', // only implemented on macOS
];

export const CALLBACK_FUNCTIONS: FMember[] = [
  'access',
  'appendFile',
  'chmod',
  'chown',
  'copyFile',
  'cp' as FMember, // added in v16
  'exists', // deprecated, inconsistent cb signature
  'lchown',
  'link',
  'lstat',
  'lutimes', // added in v12
  'mkdir',
  'mkdtemp',
  'open',
  'opendir', // added in v12
  'readdir',
  'readFile',
  'readlink',
  'realpath',
  'rename',
  'rm', // added in v14
  'rmdir',
  'stat',
  'symlink',
  'truncate',
  'unlink',
  'utimes',
  'writeFile',
  // 'close', // functions on file descriptor
  // 'fchmod', // functions on file descriptor
  // 'fchown', // functions on file descriptor
  // 'fdatasync', // functions on file descriptor
  // 'fstat', // functions on file descriptor
  // 'fsync', // functions on file descriptor
  // 'ftruncate', // functions on file descriptor
  // 'futimes', // functions on file descriptor
  // 'lchmod', // only implemented on macOS
  // 'read', // functions on file descriptor
  // 'readv', // functions on file descriptor
  // 'write', // functions on file descriptor
  // 'writev', // functions on file descriptor
];

export const SYNC_FUNCTIONS: FMember[] = [
  'accessSync',
  'appendFileSync',
  'chmodSync',
  'chownSync',
  'copyFileSync',
  'cpSync' as FMember, // added in v16
  'existsSync',
  'lchownSync',
  'linkSync',
  'lstatSync',
  'lutimesSync', // added in v12
  'mkdirSync',
  'mkdtempSync',
  'opendirSync', // added in v12
  'openSync',
  'readdirSync',
  'readFileSync',
  'readlinkSync',
  'realpathSync',
  'renameSync',
  'rmdirSync',
  'rmSync', // added in v14
  'statSync',
  'symlinkSync',
  'truncateSync',
  'unlinkSync',
  'utimesSync',
  'writeFileSync',
  // 'closeSync', // functions on file descriptor
  // 'fchmodSync', // functions on file descriptor
  // 'fchownSync', // functions on file descriptor
  // 'fdatasyncSync', // functions on file descriptor
  // 'fstatSync', // functions on file descriptor
  // 'fsyncSync', // functions on file descriptor
  // 'ftruncateSync', // functions on file descriptor
  // 'futimesSync', // functions on file descriptor
  // 'lchmodSync', // only implemented on macOS
  // 'readSync', // functions on file descriptor
  // 'readvSync', // functions on file descriptor
  // 'writeSync', // functions on file descriptor
  // 'writevSync', // functions on file descriptor
];
