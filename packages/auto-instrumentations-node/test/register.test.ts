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

import { execFile, PromiseWithChild, ChildProcess } from 'child_process';
import { once } from 'events';
import * as assert from 'assert';
import { promisify } from 'util';
import { Readable } from 'stream';

const execFilePromise = promisify(execFile);
const appTerminationThreshold = 500;

function runWithRegister(
  path: string,
  envOverrides?: any
): PromiseWithChild<{
  stdout: string;
  stderr: string;
}> {
  let env = Object.assign({}, process.env, {
    OTEL_TRACES_EXPORTER: 'console',
    OTEL_METRICS_EXPORTER: 'none',
    OTEL_LOG_LEVEL: 'debug',
    // nx (used by lerna run) defaults `FORCE_COLOR=true`, which in
    // node v18.17.0, v20.3.0 and later results in ANSI color escapes
    // in the ConsoleSpanExporter output that is checked below.
    FORCE_COLOR: '0',
    // Cloud resource detectors can take a few seconds, resulting in hitting
    // a test timeout.
    OTEL_NODE_RESOURCE_DETECTORS: 'none',
  });
  if (envOverrides) {
    env = Object.assign(env, envOverrides);
  }

  return execFilePromise(
    process.execPath,
    ['--require', '../build/src/register.js', path],
    {
      cwd: __dirname,
      timeout: 5000,
      killSignal: 'SIGKILL', // SIGTERM is not sufficient to terminate some hangs
      env,
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

function registerExitListeners(child: ChildProcess) {
  return [
    once(child, 'exit'),
    once(child, 'error').then(null, err => Promise.reject(err)),
  ];
}

describe('Register', function () {
  // Deliberately use a timeout > 5000 ms, so that failures in 'automatic NodeSDK shutdown should not block process termination'
  // result in a test failure and not in a test timeout.
  this.timeout(10000);

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
    const [exitPromise, errorPromise] = registerExitListeners(child);
    await waitForString(child.stdout!, 'Finished request');

    let appTerminationTook = 0;
    child.on('exit', () => {
      appTerminationTook = Date.now() - sigtermSentAt;
    });
    const sigtermSentAt = Date.now();
    child.kill('SIGTERM');
    const { stdout } = await runPromise;

    assert.ok(
      stdout.includes('OpenTelemetry SDK terminated'),
      `Process output was missing message indicating successful shutdown, got stdout:\n${stdout}`
    );

    // Check a span has been generated for the GET request done in app.js
    assert.ok(stdout.includes("name: 'GET'"), 'console span output in stdout');

    // Verify that the SDK shutdown does not block termination of the process.
    await Promise.race([exitPromise, errorPromise]);
    assert.ok(
      appTerminationTook < appTerminationThreshold,
      `The application under test terminated ${appTerminationTook} ms after sending SIGTERM, exceeding the allowed threshold of ${appTerminationThreshold} ms.`
    );
  });

  it('does not block process termination', async () => {
    const runPromise = runWithRegister('./test-app/app-server.js', {
      // Override the console exporter which are used in the other tests with an otlp exporter, to include DNS lookup,
      // establishing a connection etc.
      OTEL_TRACES_EXPORTER: 'otlp',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'https://example.com:4317',
      // 'ingress.eu-west-1.aws.dash0-dev.com:4317',
    });
    const { child } = runPromise;
    const [exitPromise, errorPromise] = registerExitListeners(child);
    await waitForString(child.stdout!, 'Finished request');

    let appTerminationTook = 0;
    child.on('exit', () => {
      appTerminationTook = Date.now() - sigtermSentAt;
    });
    const sigtermSentAt = Date.now();
    child.kill('SIGTERM');

    // Verify that the SDK shutdown does not block termination of the process.
    await Promise.race([exitPromise, errorPromise]);
    assert.ok(
      appTerminationTook < appTerminationThreshold,
      `The application under test terminated ${appTerminationTook} ms after sending SIGTERM, exceeding the allowed threshold of ${appTerminationThreshold} ms.`
    );
  });
});
