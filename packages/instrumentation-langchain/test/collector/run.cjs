/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { createHash } = require('node:crypto');
const { context, trace } = require('@opentelemetry/api');
const {
  AsyncLocalStorageContextManager,
} = require('@opentelemetry/context-async-hooks');
const {
  OTLPTraceExporter,
} = require('@opentelemetry/exporter-trace-otlp-grpc');
const {
  TracerProvider,
  SimpleSpanProcessor,
} = require('@opentelemetry/sdk-trace');
const { LangChainInstrumentation } = require('../../build/src');

const image =
  'otel/opentelemetry-collector-contrib@sha256:fd328de2552466ad78385e1b1289c3f2402b1c45f265b252aab1955b42845ac1';
const scopeName = '@opentelemetry/instrumentation-langchain';
const contentKeys = ['gen_ai.input.messages', 'gen_ai.output.messages'];

function command(args) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 120000,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `docker ${args[0]}: ${result.stdout}\n${result.stderr}`
  );
  return result.stdout.trim();
}

function readSpans(filename) {
  if (!fs.existsSync(filename)) return [];
  const contents = fs.readFileSync(filename, 'utf8');
  return contents
    .slice(0, contents.lastIndexOf('\n') + 1)
    .split('\n')
    .filter(Boolean)
    .flatMap(line =>
      JSON.parse(line).resourceSpans.flatMap(resource =>
        resource.scopeSpans.flatMap(scope =>
          scope.spans.map(span => ({
            ...span,
            scope: scope.scope,
            attributes: Object.fromEntries(
              (span.attributes ?? []).map(({ key, value }) => [
                key,
                value.stringValue ?? value.intValue ?? value,
              ])
            ),
          }))
        )
      )
    );
}

const message = (role, content) => ({
  role,
  parts: [{ type: 'text', content }],
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function exercise(provider) {
  process.env.LANGSMITH_TRACING = 'false';
  process.env.LANGCHAIN_TRACING_V2 = 'false';
  process.env.LANGCHAIN_TRACING = 'false';
  const instrumentation = new LangChainInstrumentation();
  instrumentation.setTracerProvider(provider);
  const {
    RunnableSequence,
    RunnableLambda,
  } = require('@langchain/core/runnables');
  const { AIMessage, HumanMessage } = require('@langchain/core/messages');
  const tracer = provider.getTracer('workflow-collector-regressions');
  const checks = [];
  const identity = () =>
    RunnableSequence.from([
      RunnableLambda.from(value => value),
      RunnableLambda.from(value => value),
    ]);
  const runCase = async (name, capture, run, verify, evidence = {}) => {
    instrumentation.setConfig({ captureMessageContent: capture });
    instrumentation.enable();
    const parent = tracer.startSpan(`request ${name}`);
    try {
      await context.with(trace.setSpan(context.active(), parent), run);
    } finally {
      parent.end();
    }
    // Keep SimpleSpanProcessor exports below the OTLP exporter's concurrent
    // request limit, including when the synthetic cases finish synchronously.
    await provider.forceFlush();
    checks.push({ name, capture, verify, evidence });
  };
  try {
    for (const capture of [false, true]) {
      for (const property of ['metadata', 'configurable', 'runName']) {
        const invoke = async enabled => {
          let reads = 0;
          const options = Object.defineProperty({}, property, {
            enumerable: true,
            get() {
              reads++;
              return property === 'runName'
                ? `name-${reads}`
                : { counter: reads };
            },
          });
          if (enabled) instrumentation.enable();
          else instrumentation.disable();
          const flow = RunnableSequence.from([
            RunnableLambda.from((_input, config) =>
              property === 'runName' ? reads : config[property].counter
            ),
            RunnableLambda.from(value => value),
          ]);
          const result = await flow.invoke('input', options);
          return { reads, result };
        };
        const baseline = await invoke(false);
        assert.deepEqual(baseline, { reads: 1, result: 1 });
        await runCase(
          `${property}-getter-${capture}`,
          capture,
          async () => assert.deepEqual(await invoke(true), baseline),
          span => {
            assert.equal(span.name, 'invoke_workflow RunnableSequence');
            assert.equal(span.attributes['gen_ai.conversation.id'], undefined);
          },
          { baseline, instrumented: baseline }
        );
      }
      for (const container of ['configurable', 'metadata']) {
        for (const alias of ['thread_id', 'session_id', 'conversation_id']) {
          const invoke = async enabled => {
            let reads = 0;
            const options = {
              [container]: Object.defineProperty({}, alias, {
                enumerable: true,
                get() {
                  return `session-${++reads}`;
                },
              }),
            };
            if (enabled) instrumentation.enable();
            else instrumentation.disable();
            const flow = RunnableSequence.from([
              RunnableLambda.from((_input, config) => config[container][alias]),
              RunnableLambda.from(value => value),
            ]);
            const result = await flow.invoke('input', options);
            return { reads, result };
          };
          const baseline = await invoke(false);
          await runCase(
            `${container}-${alias}-getter-${capture}`,
            capture,
            async () => assert.deepEqual(await invoke(true), baseline),
            span =>
              assert.equal(
                span.attributes['gen_ai.conversation.id'],
                undefined
              ),
            { baseline, instrumented: baseline }
          );
        }
      }
    }
    await runCase(
      'batch-answers',
      true,
      async () => {
        const flow = RunnableSequence.from([
          RunnableLambda.from(value => `generated ${value}`),
          RunnableLambda.from(value => value),
        ]);
        assert.deepEqual(await flow.batch(['one', 'two']), [
          'generated one',
          'generated two',
        ]);
      },
      span => {
        assert.deepEqual(
          JSON.parse(span.attributes[contentKeys[0]]),
          ['one', 'two'].map(x => message('user', x))
        );
        assert.deepEqual(
          JSON.parse(span.attributes[contentKeys[1]]),
          ['generated one', 'generated two'].map(x => message('assistant', x))
        );
      }
    );
    await runCase(
      'batch-mixed',
      true,
      async () => {
        const outputs = [
          'answer',
          new AIMessage('sdk'),
          [new HumanMessage('question'), new AIMessage('nested')],
          { role: 'assistant', content: 'plain' },
          {
            messages: [
              ['user', 'history'],
              ['assistant', 'wrapped'],
            ],
          },
          ['first', 'second'],
        ];
        const flow = RunnableSequence.from([
          RunnableLambda.from(index => outputs[index]),
          RunnableLambda.from(value => value),
        ]);
        const result = await flow.batch(outputs.map((_, index) => index));
        result.forEach((value, index) => assert.equal(value, outputs[index]));
      },
      span =>
        assert.deepEqual(
          JSON.parse(span.attributes[contentKeys[1]]),
          [
            ['assistant', 'answer'],
            ['assistant', 'sdk'],
            ['user', 'question'],
            ['assistant', 'nested'],
            ['assistant', 'plain'],
            ['user', 'history'],
            ['assistant', 'wrapped'],
            ['user', 'first'],
            ['user', 'second'],
          ].map(([role, text]) => message(role, text))
        )
    );

    const bytes = Buffer.alloc(4 * 1024 * 1024);
    for (let index = 0; index < bytes.length; index++)
      bytes[index] = index % 251;
    const encoded = bytes.toString('base64');
    for (const dataUrl of [false, true]) {
      await runCase(
        `large-image-${dataUrl ? 'url' : 'field'}`,
        true,
        async () => {
          const input = [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'retained text' },
                dataUrl
                  ? {
                      type: 'image_url',
                      image_url: `data:image/png;base64,${encoded}`,
                    }
                  : { type: 'image', base64: encoded },
              ],
            },
          ];
          assert.equal(await identity().invoke(input), input);
        },
        span => {
          for (const key of contentKeys) {
            const messages = JSON.parse(span.attributes[key]);
            assert.equal(messages.length, 1);
            assert.equal(messages[0].role, 'user');
            const parts = messages[0].parts;
            assert.equal(parts.length, 2);
            assert.deepEqual(parts[0], {
              type: 'text',
              content: 'retained text',
            });
            assert.equal(parts[1].type, 'blob');
            assert.equal(parts[1].modality, 'image');
            assert.equal(parts[1].content.length, encoded.length);
            const received = Buffer.from(parts[1].content, 'base64');
            assert.equal(received.length, bytes.length);
            assert.equal(
              Buffer.compare(received, bytes),
              0,
              'Collector must receive every payload byte'
            );
          }
        },
        {
          payloadBytes: bytes.length,
          base64Length: encoded.length,
          sha256: hash(bytes),
        }
      );
    }
    await runCase(
      'privacy-off',
      false,
      async () => {
        assert.equal(await identity().invoke('private-input'), 'private-input');
      },
      span => assert(!JSON.stringify(span).includes('private-input'))
    );
    await runCase(
      'normal-context',
      true,
      async () => {
        const flow = RunnableSequence.from([
          RunnableLambda.from(async value => {
            await Promise.resolve();
            tracer.startSpan('provider-child').end();
            return value.toUpperCase();
          }),
          RunnableLambda.from(value => `${value}!`),
        ]).withConfig({
          runName: 'configured',
          configurable: { thread_id: 'configured-thread' },
        });
        assert.equal(
          await flow.invoke('hello', {
            runName: 'supplied',
            metadata: { session_id: 'lower-priority' },
          }),
          'HELLO!'
        );
      },
      (span, children) => {
        assert.equal(span.name, 'invoke_workflow supplied');
        assert.equal(
          span.attributes['gen_ai.conversation.id'],
          'configured-thread'
        );
        assert.deepEqual(JSON.parse(span.attributes[contentKeys[1]]), [
          message('assistant', 'HELLO!'),
        ]);
        assert.equal(children.length, 1);
        assert.equal(children[0].parentSpanId, span.spanId);
      }
    );
    await runCase(
      'error-privacy',
      true,
      async () => {
        const failure = new TypeError('private-error-message');
        const flow = RunnableSequence.from([
          RunnableLambda.from(() => {
            throw failure;
          }),
          RunnableLambda.from(value => value),
        ]);
        await assert.rejects(flow.invoke('input'), error => error === failure);
      },
      span => {
        assert.equal(span.status?.code, 2);
        assert.equal(span.status?.message, undefined);
        assert.equal(span.attributes['error.type'], 'TypeError');
        assert.equal(span.attributes[contentKeys[1]], undefined);
        assert.equal((span.events ?? []).length, 0);
        assert(!JSON.stringify(span).includes('private-error-message'));
      }
    );
    return checks;
  } finally {
    instrumentation.disable();
  }
}

async function main() {
  process.env.OTEL_EXPORTER_OTLP_HEADERS = '';
  process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS = '';
  const root = process.env.OTEL_LANGCHAIN_COLLECTOR_ARTIFACTS || os.tmpdir();
  const directory = fs.mkdtempSync(path.join(root, 'workflow-collector-'));
  const filename = path.join(directory, 'traces.jsonl');
  const config = path.join(directory, 'collector.yaml');
  fs.writeFileSync(
    config,
    `receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
        max_recv_msg_size_mib: 64
exporters:
  file:
    path: /data/traces.jsonl
    flush_interval: 100ms
extensions:
  health_check:
    endpoint: 0.0.0.0:13133
service:
  extensions: [health_check]
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [file]
`
  );
  let id;
  let provider;
  let passed = false;
  const manager = new AsyncLocalStorageContextManager();
  context.setGlobalContextManager(manager.enable());
  try {
    id = command([
      'create',
      '--rm',
      ...(typeof process.getuid === 'function'
        ? ['--user', `${process.getuid()}:${process.getgid()}`]
        : []),
      '--publish',
      '127.0.0.1::4317',
      '--publish',
      '127.0.0.1::13133',
      '--mount',
      `type=bind,source=${directory},target=/data`,
      image,
      '--config=/data/collector.yaml',
    ]);
    command(['start', id]);
    const endpoint = command(['port', id, '4317/tcp']);
    const health = command(['port', id, '13133/tcp']);
    assert.match(endpoint, /^127\.0\.0\.1:\d+$/);
    assert.match(health, /^127\.0\.0\.1:\d+$/);
    let ready = false;
    let healthError;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const response = await fetch(`http://${health}`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          ready = true;
          break;
        }
        healthError = `HTTP ${response.status}`;
      } catch (error) {
        healthError = error.message;
      }
      await delay(100);
    }
    assert(ready, `Collector did not become healthy: ${healthError}`);
    provider = new TracerProvider({
      spanLimits: { attributeValueLengthLimit: Infinity },
      spanProcessors: [
        new SimpleSpanProcessor({
          exporter: new OTLPTraceExporter({
            url: `http://${endpoint}`,
            timeoutMillis: 60000,
          }),
        }),
      ],
    });
    const checks = await exercise(provider);
    await provider.shutdown();
    provider = undefined;
    const expectedCount = checks.length * 2 + 1;
    let spans = [];
    for (let attempt = 0; attempt < 50; attempt++) {
      await delay(100);
      spans = readSpans(filename);
      if (spans.length >= expectedCount) break;
    }
    assert.equal(spans.length, expectedCount, 'real Collector file span count');
    const receipt = {
      image,
      container: id,
      endpoint,
      health,
      maxRecvMsgSizeMiB: 64,
      cases: [],
    };
    for (const check of checks) {
      const parent = spans.find(span => span.name === `request ${check.name}`);
      assert(parent, `missing parent for ${check.name}`);
      const related = spans.filter(
        span => span.traceId === parent.traceId && span !== parent
      );
      const workflows = related.filter(span => span.scope.name === scopeName);
      assert.equal(workflows.length, 1, check.name);
      const span = workflows[0];
      assert.equal(span.scope.version, require('../../package.json').version);
      assert.equal(span.attributes['gen_ai.operation.name'], 'invoke_workflow');
      assert.equal(span.kind, 1);
      assert.equal(span.parentSpanId, parent.spanId);
      assert.equal(span.droppedAttributesCount ?? 0, 0);
      assert(BigInt(span.endTimeUnixNano) >= BigInt(span.startTimeUnixNano));
      if (check.name !== 'error-privacy')
        assert.equal(span.status?.code ?? 0, 0);
      if (!check.capture)
        for (const key of contentKeys)
          assert.equal(span.attributes[key], undefined);
      const children = related.filter(span => span !== workflows[0]);
      assert.equal(children.length, check.name === 'normal-context' ? 1 : 0);
      check.verify(span, children);
      receipt.cases.push({
        name: check.name,
        spans: related.length + 1,
        ...check.evidence,
      });
      console.log(
        `PASS ${check.name}: ${related.length + 1} Collector-received spans`
      );
    }
    receipt.receivedSpans = spans.length;
    fs.writeFileSync(
      path.join(directory, 'receipt.json'),
      JSON.stringify(receipt, null, 2) + '\n'
    );
    passed = true;
    console.log(
      `Collector 0.161.0: ${checks.length} cases, ${spans.length} spans; receipt ${path.join(directory, 'receipt.json')}`
    );
  } finally {
    try {
      if (provider) await provider.shutdown();
    } finally {
      context.disable();
      manager.disable();
      if (id) {
        const logs = spawnSync('docker', ['logs', id], {
          encoding: 'utf8',
          timeout: 30000,
        });
        fs.writeFileSync(
          path.join(directory, 'collector.log'),
          `${logs.stdout ?? ''}\n${logs.stderr ?? ''}`
        );
        command(['stop', '--timeout', '10', id]);
        assert.equal(command(['ps', '-aq', '--filter', `id=${id}`]), '');
      }
      if (passed) {
        fs.rmSync(filename);
        fs.rmSync(config);
        console.log(
          'Removed own Collector container and full payload/config files; retained receipt and logs.'
        );
      } else {
        console.error(`Collector failure evidence retained in ${directory}`);
      }
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
