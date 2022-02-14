import * as fs from 'fs';

const TEST_CONTENTS = Buffer.from('hello, world\n');

const syncOnly = { async: false, promise: false };
const noSync = { sync: false };
const ENOENT = /ENOENT: no such file or directory, /;
export default [
  [
    'access',
    ['./test/fixtures/readtest', fs.constants.R_OK],
    {
      result: undefined,
    },
    [
      {
        name: 'fs %NAME',
      },
    ],
  ],
  [
    'access',
    ['./test/fixtures/readtest-404', fs.constants.R_OK],
    {
      error: ENOENT,
    },
    [
      {
        name: 'fs %NAME',
        error: ENOENT,
      },
    ],
  ],
  [
    'readFile',
    ['./test/fixtures/readtest'],
    {
      result: TEST_CONTENTS,
    },
    [
      { name: 'fs openSync' },
      {
        name: 'fs %NAME',
      },
    ],
    syncOnly,
  ],
  [
    'readFile',
    ['./test/fixtures/readtest'],
    {
      result: TEST_CONTENTS,
    },
    [
      {
        name: 'fs %NAME',
      },
    ],
    noSync,
  ],
  [
    'readFile',
    ['./test/fixtures/readtest-404'],
    {
      error: ENOENT,
    },
    [
      { name: 'fs openSync', error: ENOENT },
      {
        name: 'fs %NAME',
        error: ENOENT,
      },
    ],
    syncOnly,
  ],
  [
    'readFile',
    ['./test/fixtures/readtest-404'],
    {
      error: ENOENT,
    },
    [
      {
        name: 'fs %NAME',
        error: ENOENT,
      },
    ],
    noSync,
  ],
];
