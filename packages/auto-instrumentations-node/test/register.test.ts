/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile, PromiseWithChild } from 'child_process';
import * as assert from 'assert';
import { promisify } from 'util';
import { Readable } from 'stream';

const execFilePromise = promisify(execFile);

function runWithRegister(
  path: string,
  timeout = 5000,
  extraEnv: NodeJS.ProcessEnv = {}
): PromiseWithChild<{
  stdout: string;
  stderr: string;
}> {
  return execFilePromise(
    process.execPath,
    ['--require', '../dist/register.cjs', path],
    {
      cwd: __dirname,
      timeout,
      killSignal: 'SIGKILL', // SIGTERM is not sufficient to terminate some hangs
      env: Object.assign(
        {},
        process.env,
        {
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
        },
        extraEnv
      ),
    }
  );
}

// Like runWithRegister(), but resolves with the exit status instead of
// rejecting when the process exits non-zero.
async function runToExit(
  path: string,
  extraEnv: NodeJS.ProcessEnv
): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}> {
  const runPromise = runWithRegister(path, 5000, extraEnv);
  const { child } = runPromise;
  try {
    const { stdout, stderr } = await runPromise;
    return { code: child.exitCode, signal: child.signalCode, stdout, stderr };
  } catch (err) {
    const { code, signal, stdout, stderr } = err as {
      code: number | null;
      signal: NodeJS.Signals | null;
      stdout: string;
      stderr: string;
    };
    return { code, signal, stdout, stderr };
  }
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
  this.timeout(5000); // Same timeout as in the execFile() above.

  it('can load auto instrumentation from command line', async () => {
    const runPromise = runWithRegister('./test-app/app.js');
    const { child } = runPromise;
    const { stdout, stderr } = await runPromise;
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

    // register.js used to set up its own diag logger and then let NodeSDK
    // set up an equivalent one again, causing this warning to be logged
    // on every single start.
    assert.ok(
      !stderr.includes('Current logger will be overwritten'),
      `Process should not log a diag logger override warning, got stderr:\n${stderr}`
    );
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
  describe('OTEL_NODE_FLUSH_ON_CRASH', () => {
    const flushOnCrashEnv = { OTEL_NODE_FLUSH_ON_CRASH: 'true' };

    it('does not shut down the NodeSDK on an uncaught exception by default', async () => {
      const { code, signal, stdout, stderr } = await runToExit(
        './test-app/app-crash.js',
        {}
      );

      assert.strictEqual(code, 1, `exit code (${code}), signal (${signal})`);
      assert.ok(stderr.includes('test app crash'), `got stderr:\n${stderr}`);
      assert.ok(
        !stdout.includes('OpenTelemetry SDK terminated'),
        `SDK should not be shut down, got stdout:\n${stdout}`
      );
    });

    it('shuts down the NodeSDK before exiting on an uncaught exception', async () => {
      const { code, signal, stdout, stderr } = await runToExit(
        './test-app/app-crash.js',
        flushOnCrashEnv
      );

      assert.strictEqual(code, 1, `exit code (${code}), signal (${signal})`);
      assert.ok(stderr.includes('test app crash'), `got stderr:\n${stderr}`);
      assert.ok(
        stdout.includes('OpenTelemetry SDK terminated'),
        `Process output was missing message indicating successful shutdown, got stdout:\n${stdout}`
      );
      assert.ok(
        stdout.includes("name: 'GET'"),
        'console span output in stdout'
      );
    });

    it('shuts down the NodeSDK before exiting on an unhandled rejection', async () => {
      const { code, signal, stdout, stderr } = await runToExit(
        './test-app/app-crash.js',
        { ...flushOnCrashEnv, TEST_APP_CRASH_MODE: 'reject' }
      );

      assert.strictEqual(code, 1, `exit code (${code}), signal (${signal})`);
      assert.ok(
        stderr.includes('test app rejection'),
        `got stderr:\n${stderr}`
      );
      assert.ok(
        stdout.includes('OpenTelemetry SDK terminated'),
        `Process output was missing message indicating successful shutdown, got stdout:\n${stdout}`
      );
    });

    it('leaves the process running when the app handles uncaught exceptions', async () => {
      const { code, signal, stdout } = await runToExit(
        './test-app/app-crash.js',
        { ...flushOnCrashEnv, TEST_APP_CRASH_MODE: 'handled' }
      );

      assert.strictEqual(code, 0, `exit code (${code}), signal (${signal})`);
      assert.ok(
        stdout.includes('app handled: test app crash'),
        `got stdout:\n${stdout}`
      );
      // The SDK is still shut down by the `beforeExit` handler.
      assert.ok(
        stdout.includes('OpenTelemetry SDK terminated'),
        `Process output was missing message indicating successful shutdown, got stdout:\n${stdout}`
      );
    });
  });
});
