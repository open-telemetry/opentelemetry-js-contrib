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

import { execFile, PromiseWithChild } from 'child_process';
import * as assert from 'assert';
import { promisify } from 'util';
import { Readable } from 'stream';

const execFilePromise = promisify(execFile);

function runWithRegister(path: string): PromiseWithChild<{
  stdout: string;
  stderr: string;
}> {
  return execFilePromise(
    process.execPath,
    ['--require', '../build/src/register.js', path],
    {
      cwd: __dirname,
      timeout: 5000,
      killSignal: 'SIGKILL', // SIGTERM is not sufficient to terminate some hangs
      env: Object.assign({}, process.env, {
        OTEL_TRACES_EXPORTER: 'console',
        OTEL_LOG_LEVEL: 'debug',
        // nx (used by lerna run) defaults `FORCE_COLOR=true`, which in
        // node v18.17.0, v20.3.0 and later results in ANSI color escapes
        // in the ConsoleSpanExporter output that is checked below.
        FORCE_COLOR: '0',
      }),
    }
  );
}

function waitForString(stream: Readable, str: string): Promise<void> {
  return new Promise((resolve, reject) => {
    function check(chunk: Buffer): void {
      if (chunk.includes(str)) {
        resolve();
        stream.off('data', check);
      }
    }
    stream.on('data', check);
    stream.on('close', () =>
      reject(`Stream closed without ever seeing "${str}"`)
    );
  });
}

describe('Register', function () {
  it('can load auto instrumentation from command line', async () => {
    const runPromise = runWithRegister('./test-app/app.js');
    const { child } = runPromise;
    const { stdout } = await runPromise;
    assert.equal(child.exitCode, 0, `child.exitCode (${child.exitCode})`);
    assert.equal(
      child.signalCode,
      null,
      `child.signalCode (${child.signalCode})`
    );

    assert.ok(
      stdout.includes(
        'OpenTelemetry automatic instrumentation started successfully'
      )
    );

    assert.ok(
      stdout.includes('OpenTelemetry SDK terminated'),
      `Process output was missing message indicating successful shutdown, got stdout:\n${stdout}`
    );

    // Check a span has been generated for the GET request done in app.js
    assert.ok(stdout.includes("name: 'GET'"), 'console span output in stdout');
  });

  it('shuts down the NodeSDK when SIGTERM is received', async () => {
    const runPromise = runWithRegister('./test-app/app-server.js');
    const { child } = runPromise;
    await waitForString(child.stdout!, 'Finished request');
    child.kill('SIGTERM');
    const { stdout } = await runPromise;

    assert.ok(
      stdout.includes('OpenTelemetry SDK terminated'),
      `Process output was missing message indicating successful shutdown, got stdout:\n${stdout}`
    );

    // Check a span has been generated for the GET request done in app.js
    assert.ok(stdout.includes("name: 'GET'"), 'console span output in stdout');
  });
});
