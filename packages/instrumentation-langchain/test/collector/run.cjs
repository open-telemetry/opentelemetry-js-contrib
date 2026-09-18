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

const image =
  'otel/opentelemetry-collector-contrib@sha256:fd328de2552466ad78385e1b1289c3f2402b1c45f265b252aab1955b42845ac1';
const scenarios = {
  'scenario.cjs': [
    'workflow_content_off',
    'workflow_content_on',
    'workflow_stream',
    'runnable_map',
    'tool_content_off',
    'tool_content_on',
    'tool_error',
    'invoke_agent',
    'invoke_agent_stream',
    'invoke_agent_content_on',
    'invoke_agent_stream_content_on',
  ],
  'framework-scenario.cjs': [
    'retrieval_content_off',
    'retrieval_content_on',
    'retrieval_mmr',
    'retrieval_error',
    'graph_workflow',
    'graph_stream',
    'graph_updates',
    'graph_error',
    'nested_workflow_stream',
    'scoped_suppression',
    'agent_configured',
    'agent_dynamic_model',
    'agent_structured_output',
    'agent_estimated_usage',
  ],
};
const privateAttributes = [
  'gen_ai.input.messages',
  'gen_ai.output.messages',
  'gen_ai.system_instructions',
  'gen_ai.tool.call.arguments',
  'gen_ai.tool.call.result',
  'gen_ai.retrieval.query.text',
  'gen_ai.retrieval.documents',
];

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    encoding: 'utf8',
    timeout: 120000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `${program}: ${result.stdout}\n${result.stderr}`
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

function verify(name, spans) {
  const retrieval = name.startsWith('retrieval_');
  const operation = retrieval
    ? 'retrieval'
    : name.startsWith('tool_')
      ? 'execute_tool'
      : name.startsWith('invoke_agent') || name.startsWith('agent_')
        ? 'invoke_agent'
        : 'invoke_workflow';
  assert.equal(spans.length, name === 'nested_workflow_stream' ? 2 : 1);
  for (const span of spans) {
    assert.equal(span.scope.name, '@opentelemetry/instrumentation-langchain');
    assert.equal(span.attributes['gen_ai.operation.name'], operation);
    assert.equal(span.kind, retrieval ? 3 : 1);
    assert(BigInt(span.endTimeUnixNano) >= BigInt(span.startTimeUnixNano));
    assert.equal(span.status?.code ?? 0, name.endsWith('_error') ? 2 : 0);
    if (name.endsWith('_error')) {
      assert.equal(span.attributes['error.type'], 'TypeError');
      assert.equal(span.status?.message, undefined);
      assert.equal((span.events ?? []).length, 0);
    }
    const captureOff =
      name.endsWith('_off') ||
      [
        'runnable_map',
        'invoke_agent',
        'invoke_agent_stream',
        'scoped_suppression',
        'tool_error',
      ].includes(name);
    if (captureOff) {
      for (const key of privateAttributes)
        assert.equal(
          span.attributes[key],
          undefined,
          `${name}: unexpected ${key}`
        );
    }
    if (retrieval) {
      assert.equal(span.attributes['server.address'], undefined);
      assert.equal(Number(span.attributes['gen_ai.retrieval.top_k']), 1);
      if (!captureOff && !name.endsWith('_error')) {
        assert.deepEqual(
          JSON.parse(span.attributes['gen_ai.retrieval.documents']),
          name === 'retrieval_mmr'
            ? [{ id: 'doc-1' }]
            : [{ id: 'doc-1', score: 1 }]
        );
      }
    }
    if (name.startsWith('graph_')) {
      assert.equal(span.attributes['gen_ai.conversation.id'], 'graph-thread');
      if (name === 'graph_updates' || name === 'graph_error')
        assert.equal(span.attributes['gen_ai.output.messages'], undefined);
    }
    if (name === 'agent_estimated_usage') {
      assert.equal(Number(span.attributes['gen_ai.usage.input_tokens']), 7);
      assert.equal(Number(span.attributes['gen_ai.usage.output_tokens']), 3);
    } else if (name === 'agent_structured_output') {
      assert.equal(span.attributes['gen_ai.output.type'], 'json');
    } else if (name.startsWith('agent_')) {
      assert.equal(
        span.attributes['gen_ai.conversation.id'],
        'configured-thread'
      );
      assert.equal(
        span.attributes['gen_ai.agent.description'],
        'Synthetic conformance agent.'
      );
      assert.equal(
        span.attributes['gen_ai.request.model'],
        name === 'agent_dynamic_model' ? undefined : 'initial-model'
      );
    }
  }
  if (name === 'nested_workflow_stream') {
    const inner = spans.find(
      span => span.attributes['gen_ai.workflow.name'] === 'inner'
    );
    const outer = spans.find(
      span => span.attributes['gen_ai.workflow.name'] === 'outer'
    );
    assert(inner && outer);
    assert.equal(inner.parentSpanId, outer.spanId);
    assert.equal(inner.traceId, outer.traceId);
  }
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'otel-langchain-'));
  const filename = path.join(directory, 'traces.jsonl');
  fs.writeFileSync(
    path.join(directory, 'collector.yaml'),
    `receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
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
  let passed = false;
  try {
    id = command('docker', [
      'create',
      '--rm',
      ...(typeof process.getuid === 'function' &&
      typeof process.getgid === 'function'
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
    command('docker', ['start', id]);
    const health = command('docker', ['port', id, '13133/tcp']);
    let ready = false;
    let lastHealthError;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const response = await fetch(`http://${health}`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          ready = true;
          break;
        }
        lastHealthError = new Error(`Collector health HTTP ${response.status}`);
      } catch (error) {
        lastHealthError = error;
      }
      await delay(100);
    }
    assert(ready, `Collector failed to start: ${lastHealthError}`);
    const endpoint = command('docker', ['port', id, '4317/tcp']);
    let count = 0;
    for (const [program, names] of Object.entries(scenarios)) {
      for (const name of names) {
        const before = readSpans(filename).length;
        command(
          process.execPath,
          [path.join(__dirname, '..', 'conformance', program), name],
          {
            env: {
              ...process.env,
              OTEL_EXPORTER_OTLP_ENDPOINT: `http://${endpoint}`,
              OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `http://${endpoint}`,
              OTEL_EXPORTER_OTLP_HEADERS: '',
              OTEL_EXPORTER_OTLP_TRACES_HEADERS: '',
              OTEL_RESOURCE_ATTRIBUTES: 'service.name=langchain-collector-test',
            },
          }
        );
        await delay(350);
        const spans = readSpans(filename).slice(before);
        verify(name, spans);
        count++;
        console.log(`PASS ${name}: ${spans.length} collector-received spans`);
      }
    }
    console.log(`Collector 0.161.0: ${count} scenarios passed`);
    passed = true;
  } finally {
    if (id) {
      command('docker', ['stop', '--timeout', '10', id]);
    }
    if (passed) fs.rmSync(directory, { recursive: true });
    else console.error(`Collector evidence retained in ${directory}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
