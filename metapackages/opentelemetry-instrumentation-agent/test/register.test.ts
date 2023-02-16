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
import { promisify } from 'util';
import * as childProcess from 'child_process';
import * as assert from 'assert';

const exec = promisify(childProcess.exec);

describe('Register', function () {
  this.timeout(8000);
  before(async () => {
    await exec('tsc -p .');
  });

  it('can load the agent from command line', async () => {
    const { stdout } = await exec(
      'cd ./test/test-app ; env OTEL_LOG_LEVEL=debug node --require ../../build/src/register.js app.js ; cd ../..'
    );

    assert.ok(stdout.includes('Tracing initialized'));
  });
});
