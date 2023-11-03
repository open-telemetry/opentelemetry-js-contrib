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

import { spawnSync } from 'child_process';
import * as assert from 'assert';

describe('Register', function () {
  this.timeout(5000);
  it('can load auto instrumentation from command line', async () => {
    const proc = spawnSync(
      process.execPath,
      ['--require', '../build/src/register.js', './test-app/app.js'],
      {
        cwd: __dirname,
        timeout: 5000,
        env: Object.assign(
          {},
          process.env,
          {
            OTEL_NODE_RESOURCE_DETECTORS: 'none',
            OTEL_TRACES_EXPORTER: 'console',
          }
        )
      }
    );
    console.log('XXX proc: status=%s stdout=--\n%s\n-- stderr=--\n%s\n--', proc.status, proc.stdout, proc.stderr);
    assert.ifError(proc.error);
    assert.ok(
      proc.stdout.includes(
        'OpenTelemetry automatic instrumentation started successfully'
      )
    );

    // Check a span has been generated for the GET request done in app.js
    assert.ok(proc.stdout.includes("name: 'GET'"));
  });
});
