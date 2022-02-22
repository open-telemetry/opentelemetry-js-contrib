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

import { FMember, FPMember } from '../src/types';
import * as fs from 'fs';

export type FsFunction = FPMember & FMember;
export type Opts = {
  sync?: boolean;
  callback?: boolean;
  promise?: boolean;
};
export type Result = { error?: RegExp; result?: any };
export type TestCase = [FsFunction, any[], Result, any[], Opts?];
export type TestCreator = (
  name: FsFunction,
  args: any[],
  result: Result,
  spans: any[]
) => void;

const TEST_CONTENTS = Buffer.from('hello, world\n');

const syncOnly: Opts = { callback: false, promise: false };
const callbackOnly: Opts = { sync: false, promise: false };
const promiseOnly: Opts = { sync: false, callback: false };
const noSync: Opts = { sync: false };
// const noAsync: Opts = { callback: false };
// const noPromise: Opts = { promise: false };
const ENOENT = /ENOENT: no such file or directory, /;
const tests: TestCase[] = [
  [
    'access',
    ['./test/fixtures/readtest', fs.constants.R_OK],
    { result: undefined },
    [{ name: 'fs %NAME' }],
  ],
  [
    'access',
    ['./test/fixtures/readtest-404', fs.constants.R_OK],
    { error: ENOENT },
    [{ name: 'fs %NAME', error: ENOENT }],
  ],
  [
    'readFile',
    ['./test/fixtures/readtest'],
    { result: TEST_CONTENTS },
    [{ name: 'fs openSync' }, { name: 'fs %NAME' }],
    syncOnly,
  ],
  [
    'readFile',
    ['./test/fixtures/readtest'],
    { result: TEST_CONTENTS },
    [{ name: 'fs %NAME' }],
    noSync,
  ],
  [
    'readFile',
    ['./test/fixtures/readtest-404'],
    { error: ENOENT },
    [
      { name: 'fs openSync', error: ENOENT },
      { name: 'fs %NAME', error: ENOENT },
    ],
    syncOnly,
  ],
  [
    'readFile',
    ['./test/fixtures/readtest-404'],
    { error: ENOENT },
    [{ name: 'fs %NAME', error: ENOENT }],
    noSync,
  ],
  [
    'writeFile',
    ['./test/fixtures/writetest', TEST_CONTENTS],
    { result: undefined },
    [{ name: 'fs openSync' }, { name: 'fs %NAME' }],
    syncOnly,
  ],
  [
    'writeFile',
    ['./test/fixtures/writetest', TEST_CONTENTS],
    { result: undefined },
    [{ name: 'fs %NAME' }],
    promiseOnly,
  ],
  [
    'writeFile',
    ['./test/fixtures/writetest', TEST_CONTENTS],
    { result: undefined },
    [{ name: 'fs open' }, { name: 'fs %NAME' }],
    callbackOnly,
  ],
];

export default tests;
