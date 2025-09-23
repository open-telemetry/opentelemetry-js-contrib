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

export type FsFunction = FMember;
export type Opts = {
  sync?: boolean;
  callback?: boolean;
  promise?: boolean;
};
export type Result = {
  error?: RegExp;
  result?: any;
  resultAsError?: any;
  hasPromiseVersion?: boolean;
};
export type TestCase = [FsFunction, any[], Result, any[], Opts?];
export type TestCreator<Member extends FMember | FPMember> = (
  name: Member,
  args: any[],
  result: Result,
  spans: any[]
) => void;

const TEST_CONTENTS = Buffer.from('hello, world');
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
    [{ name: 'fs %NAME' }],
  ],
  [
    'readFile',
    ['./test/fixtures/readtest-404'],
    { error: ENOENT },
    [{ name: 'fs %NAME', error: ENOENT }],
  ],
  [
    'writeFile',
    ['./test/fixtures/writetest', TEST_CONTENTS],
    { result: undefined },
    [{ name: 'fs %NAME' }],
  ],
  [
    'exists' as FsFunction, // we are defining promisified version of exists in the tests, so this is OK
    ['./test/fixtures/exists-404'],
    { resultAsError: false },
    [{ name: 'fs %NAME' }],
  ],
  [
    'exists' as FsFunction, // we are defining promisified version of exists in the tests, so this is OK
    ['./test/fixtures/readtest'],
    { resultAsError: true },
    [{ name: 'fs %NAME' }],
  ],
  ['realpath', ['/./'], { result: '/' }, [{ name: 'fs %NAME' }]],
  [
    'realpath.native',
    ['/./'],
    { result: '/', hasPromiseVersion: false },
    [{ name: 'fs %NAME' }],
  ],
];

export default tests;
