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
import * as assert from 'assert';

const matchVersions = /([0-9]+)\.([0-9]+)\.([0-9]+)/;
const getVersions = (semver: string) => {
  const match = semver.match(matchVersions);
  if (match) {
    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
    };
  }
  throw new Error(`Unable to parse version: ${semver}`);
};

assert.deepStrictEqual(getVersions('1.23.45'), {
  major: 1,
  minor: 23,
  patch: 45,
});
assert.deepStrictEqual(getVersions('v2.23.45-beta21'), {
  major: 2,
  minor: 23,
  patch: 45,
});

/*
	We need to skip tests for pg@7 and node@14+ combination, because in pg@7
	the client never connects.
	Fix landed in pg@8: https://github.com/brianc/node-postgres/pull/2171
	Ref: https://github.com/nodejs/node/issues/38247
*/
export const isSupported = (
  nodeVersion: string,
  pgVersion: string
): boolean => {
  try {
    const { major: pgMajor } = getVersions(pgVersion);
    const { major: nodeMajor } = getVersions(nodeVersion);
    return !(pgMajor === 7 && nodeMajor >= 14);
  } catch (e) {
    return true;
  }
};

assert.strictEqual(isSupported('16.0.0', '7.0.0'), false);
assert.strictEqual(isSupported('14.0.0', '7.0.0'), false);
assert.strictEqual(isSupported('12.0.0', '7.0.0'), true);
assert.strictEqual(isSupported('16.0.0', '8.0.0'), true);
assert.strictEqual(isSupported('12.0.0', '8.0.0'), true);
