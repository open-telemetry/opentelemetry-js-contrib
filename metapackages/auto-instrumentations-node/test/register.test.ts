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
  it('can load auto instrumentation from command line', () => {
    const proc = spawnSync(
      process.execPath,
      ['--require', '../build/src/register.js', './test-app/app.js'],
      {
        cwd: __dirname,
        timeout: 5000,
        killSignal: 'SIGKILL', // SIGTERM is not sufficient to terminate some hangs
        env: Object.assign({}, process.env, {
          OTEL_NODE_RESOURCE_DETECTORS: 'none',
          OTEL_TRACES_EXPORTER: 'console',
          // nx (used by lerna run) defaults `FORCE_COLOR=true`, which in
          // node v18.17.0, v20.3.0 and later results in ANSI color escapes
          // in the ConsoleSpanExporter output that is checked below.
          FORCE_COLOR: '0',
        }),
      }
    );
    assert.ifError(proc.error);
    assert.equal(proc.status, 0, `proc.status (${proc.status})`);
    assert.equal(proc.signal, null, `proc.signal (${proc.signal})`);

    assert.ok(
      proc.stdout.includes(
        'OpenTelemetry automatic instrumentation started successfully'
      )
    );

    // Check a span has been generated for the GET request done in app.js
    assert.ok(
      proc.stdout.includes("name: 'GET'"),
      'console span output in stdout'
    );
  });
});
