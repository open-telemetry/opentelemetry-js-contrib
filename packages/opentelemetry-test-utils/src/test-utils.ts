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

import * as childProcess from 'child_process';
import {
  HrTime,
  Span,
  SpanAttributes,
  SpanKind,
  SpanStatus,
} from '@opentelemetry/api';
import * as assert from 'assert';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  hrTimeToMilliseconds,
  hrTimeToMicroseconds,
} from '@opentelemetry/core';
import * as path from 'path';

const dockerRunCmds = {
  cassandra:
    'docker run --rm -d --name otel-cassandra -p 9042:9042 bitnami/cassandra:3',
  memcached:
    'docker run --rm -d --name otel-memcached -p 11211:11211 memcached:1.6.9-alpine',
  mssql:
    'docker run --rm -d --name otel-mssql -p 1433:1433 -e SA_PASSWORD=mssql_passw0rd -e ACCEPT_EULA=Y mcr.microsoft.com/mssql/server:2017-latest',
  mysql:
    'docker run --rm -d --name otel-mysql -p 33306:3306 -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=test_db -e MYSQL_USER=otel -e MYSQL_PASSWORD=secret mysql:5.7 --log_output=TABLE --general_log=ON',
  postgres:
    'docker run --rm -d --name otel-postgres -p 54320:5432 -e POSTGRES_PASSWORD=postgres postgres:15-alpine',
  redis: 'docker run --rm -d --name otel-redis -p 63790:6379 redis:alpine',
};

export function startDocker(db: keyof typeof dockerRunCmds) {
  const tasks = [run(dockerRunCmds[db])];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (task && task.code !== 0) {
      console.error('Failed to start container!');
      console.error(task.output);
      return false;
    }
  }
  return true;
}

export function cleanUpDocker(db: keyof typeof dockerRunCmds) {
  run(`docker stop otel-${db}`);
}

function run(cmd: string) {
  try {
    const proc = childProcess.spawnSync(cmd, {
      shell: true,
    });
    const output = Buffer.concat(
      proc.output.filter(c => c) as Buffer[]
    ).toString('utf8');
    if (proc.status !== 0) {
      console.error('Failed run command:', cmd);
      console.error(output);
    }
    return {
      code: proc.status,
      output,
    };
  } catch (e) {
    console.log(e);
    return;
  }
}

export const assertSpan = (
  span: ReadableSpan,
  kind: SpanKind,
  attributes: SpanAttributes,
  events: TimedEvent[],
  status: SpanStatus
) => {
  assert.strictEqual(span.spanContext().traceId.length, 32);
  assert.strictEqual(span.spanContext().spanId.length, 16);
  assert.strictEqual(span.kind, kind);

  assert.ok(span.endTime);
  assert.strictEqual(span.links.length, 0);

  assert.ok(
    hrTimeToMicroseconds(span.startTime) < hrTimeToMicroseconds(span.endTime)
  );
  assert.ok(hrTimeToMilliseconds(span.endTime) > 0);

  // attributes
  assert.deepStrictEqual(span.attributes, attributes);

  // events
  assert.deepStrictEqual(span.events, events);

  assert.strictEqual(span.status.code, status.code);
  if (status.message) {
    assert.strictEqual(span.status.message, status.message);
  }
};

// Check if childSpan was propagated from parentSpan
export const assertPropagation = (
  childSpan: ReadableSpan,
  parentSpan: Span
) => {
  const targetSpanContext = childSpan.spanContext();
  const sourceSpanContext = parentSpan.spanContext();
  assert.strictEqual(targetSpanContext.traceId, sourceSpanContext.traceId);
  assert.strictEqual(childSpan.parentSpanId, sourceSpanContext.spanId);
  assert.strictEqual(
    targetSpanContext.traceFlags,
    sourceSpanContext.traceFlags
  );
  assert.notStrictEqual(targetSpanContext.spanId, sourceSpanContext.spanId);
};

/**
 * Represents a timed event.
 * A timed event is an event with a timestamp.
 */
export interface TimedEvent {
  time: HrTime;
  /** The name of the event. */
  name: string;
  /** The attributes of the event. */
  attributes?: SpanAttributes;
  /** Count of attributes of the event that were dropped due to collection limits */
  droppedAttributesCount?: number;
}

export const getPackageVersion = (packageName: string) => {
  // With npm workspaces, `require.main` could be in the top-level node_modules,
  // e.g. "<repo>/node_modules/mocha/bin/mocha" when running mocha tests, while
  // the target package could be installed in a workspace subdir, e.g.
  // "<repo>/plugins/node/opentelemetry-instrumentation/mysql2" for
  // "test-all-versions" tests that tend to install conflicting package
  // versions. Prefix the search paths with the cwd to include the workspace
  // dir.
  const packagePath = require?.resolve(packageName, {
    paths: [path.join(process.cwd(), 'node_modules')].concat(
      require?.main?.paths || []
    ),
  });
  const packageJsonPath = path.join(path.dirname(packagePath), 'package.json');
  return require(packageJsonPath).version;
};
