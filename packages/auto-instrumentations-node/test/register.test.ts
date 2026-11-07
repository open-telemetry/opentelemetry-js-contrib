/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChildProcess, execFile, PromiseWithChild, spawn } from 'child_process';
import * as assert from 'assert';
import { promisify } from 'util';
import { Readable } from 'stream';
import * as path from 'path';

const execFilePromise = promisify(execFile);

function runWithRegister(path: string): PromiseWithChild<{
  stdout: string;
  stderr: string;
}> {
  return execFilePromise(
    process.execPath,
    ['--require', '../dist/register.cjs', path],
    {
      cwd: __dirname,
      timeout: 5000,
      killSignal: 'SIGKILL', // SIGTERM is not sufficient to terminate some hangs
      env: Object.assign({}, process.env, {
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
});

const REGISTER_PATH = path.join(__dirname, '..', 'dist', 'register.cjs');

/**
 * Environment for the injection-contract tests: no exporter writes to a stream of
 * its own, so anything appearing on stdout or stderr is a diagnostic rather than
 * telemetry the user asked for.
 */
function contractEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return Object.assign(
    {},
    process.env,
    {
      OTEL_TRACES_EXPORTER: 'none',
      OTEL_METRICS_EXPORTER: 'none',
      OTEL_LOGS_EXPORTER: 'none',
      OTEL_NODE_RESOURCE_DETECTORS: 'none',
      FORCE_COLOR: '0',
    },
    extra
  );
}

function spawnWithRegister(
  app: string,
  opts: { env?: NodeJS.ProcessEnv; preload?: string[] } = {}
): ChildProcess {
  const preload = (opts.preload ?? []).flatMap(p => ['--require', p]);
  return spawn(
    process.execPath,
    [...preload, '--require', REGISTER_PATH, app],
    { cwd: __dirname, env: opts.env ?? contractEnv() }
  );
}

function exitsWithin(child: ChildProcess, ms: number): Promise<boolean> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), ms);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function collect(
  child: ChildProcess
): Promise<{ stdout: string; stderr: string }> {
  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    child.stdout!.on('data', d => (stdout += d));
    child.stderr!.on('data', d => (stderr += d));
    child.once('close', () => resolve({ stdout, stderr }));
  });
}

/**
 * Requirements an injectable distribution has to satisfy to be safely activated by
 * an injector (the OpenTelemetry Injector, the Operator, or the System Packages),
 * which activates this hook in EVERY Node.js process on a host — including
 * applications whose owners never opted in.
 *
 * Each of these started as the reproduction of a gap. The assertion messages
 * describe the mechanism behind the failure they guard against, and what it
 * costs when this hook is activated for a whole host rather than one process.
 */
describe('Register: injection contract', function () {
  this.timeout(20000);

  it('does not prevent an app without a SIGTERM handler from terminating', async () => {
    const child = spawnWithRegister('./test-app/app-no-sigterm-handler.js');
    try {
      await waitForString(child.stdout!, 'listening');
      child.kill('SIGTERM');
      const exited = await exitsWithin(child, 5000);
      assert.ok(
        exited,
        'The process was still running 5s after SIGTERM. register adds ' +
          'process.on("SIGTERM", shutdown), which replaces Node\'s default ' +
          'terminate-on-SIGTERM behaviour and never exits or re-raises, so an ' +
          'application that installs no SIGTERM handler of its own never stops. ' +
          'Under an orchestrator it runs until the grace period expires and is ' +
          'SIGKILLed. See #3808.'
      );
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  });

  it('does not prevent the application from starting when an instrumentation fails to load', async () => {
    const child = spawnWithRegister('./test-app/app-hello.js', {
      preload: [path.join(__dirname, 'test-app', 'throwing-module.js')],
    });
    const { stdout } = await collect(child);

    assert.strictEqual(
      stdout.trim(),
      'APP_RAN',
      'The application never reached its first line. register does not guard ' +
        'its own imports, so a failure inside any one instrumentation module ' +
        'escapes the --require phase and aborts the host process. Under an ' +
        'injector that means a single unloadable module takes down every ' +
        'Node.js application on the machine, instead of leaving them ' +
        'uninstrumented.'
    );
    assert.strictEqual(child.exitCode, 0, `child.exitCode (${child.exitCode})`);
  });

  ['info', 'debug'].forEach(level => {
    it(`writes no diagnostics to stdout at OTEL_LOG_LEVEL=${level}`, async () => {
      const child = spawnWithRegister('./test-app/app-hello.js', {
        env: contractEnv({ OTEL_LOG_LEVEL: level }),
      });
      const { stdout } = await collect(child);

      const extra = stdout
        .split('\n')
        .filter(line => line.trim() !== '' && line.trim() !== 'APP_RAN');

      assert.deepStrictEqual(
        extra,
        [],
        `register wrote ${extra.length} line(s) to stdout. The host ` +
          "application's stdout is its own — it may be a pipeline stage, a " +
          'structured log stream or a protocol channel — so diagnostics belong ' +
          `on stderr. First line was: ${JSON.stringify(extra[0] ?? '')}`
      );
    });
  });
});
