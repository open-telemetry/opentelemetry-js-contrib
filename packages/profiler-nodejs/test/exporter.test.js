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

const assert = require('node:assert/strict');

const { DatakitProfilingExporter } = require('../src/exporter');

describe('DatakitProfilingExporter', () => {
  it('会按 ddtrace Node.js 兼容布局发送 multipart 请求', async () => {
    let captured;
    const exporter = new DatakitProfilingExporter({
      endpoint: 'http://127.0.0.1:9529/profiling/v1/input',
      fetch: async (url, init) => {
        captured = { url, init };
        return new Response('', { status: 200 });
      },
    });

    await exporter.export({
      startTime: new Date('2026-04-13T07:40:02.123Z'),
      endTime: new Date('2026-04-13T07:40:04.456Z'),
      family: 'nodejs',
      format: 'pprof',
      tags: {
        service: 'svc-js',
        env: 'dev',
        version: '1.2.3',
        runtime: 'Node.js',
      },
      profiles: [
        {
          type: 'wall',
          filename: 'wall.pprof',
          data: Buffer.from([1, 2, 3]),
        },
        {
          type: 'space',
          filename: 'space.pprof',
          data: Buffer.from([4, 5, 6]),
        },
      ],
    });

    assert.equal(captured.url, 'http://127.0.0.1:9529/profiling/v1/input');
    assert.equal(captured.init.method, 'POST');

    const req = new Request(captured.url, captured.init);
    const form = await req.formData();

    assert.equal(form.get('wall').name, 'wall.pprof');
    assert.equal(form.get('space').name, 'space.pprof');

    const event = JSON.parse(await form.get('event').text());
    assert.deepEqual(event, {
      version: '4',
      profiler: 'ddtrace',
      attachments: ['wall.pprof', 'space.pprof'],
      start: '2026-04-13T07:40:02Z',
      end: '2026-04-13T07:40:04Z',
      family: 'nodejs',
      format: 'pprof',
      tags_profiler:
        'env:dev,runtime:Node.js,service:svc-js,version:1.2.3',
    });
  });

  it('非 2xx 响应时会抛出错误', async () => {
    const exporter = new DatakitProfilingExporter({
      fetch: async () => new Response('bad request', { status: 400 }),
    });

    await assert.rejects(
      exporter.export({
        startTime: new Date('2026-04-13T07:40:02.123Z'),
        endTime: new Date('2026-04-13T07:40:04.456Z'),
        family: 'nodejs',
        format: 'pprof',
        tags: {},
        profiles: [
          {
            type: 'wall',
            filename: 'wall.pprof',
            data: Buffer.from([1]),
          },
        ],
      }),
      /datakit profiling export failed: 400/
    );
  });
});
