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

'use strict';

const http = require('http');

const port = Number(process.env.RECEIVER_PORT || 9529);
const basePath = process.env.RECEIVER_PATH || '/otel';
const acceptedPaths = new Set([
  normalizePath(basePath),
  normalizePath(`${basePath}/v1/traces`),
]);

const server = http.createServer((req, res) => {
  const requestPath = normalizePath(req.url || '/');
  if (req.method !== 'POST' || !acceptedPaths.has(requestPath)) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: false,
        message: `unsupported route ${req.method} ${requestPath}`,
      })
    );
    return;
  }

  const chunks = [];
  req.on('data', chunk => {
    chunks.push(chunk);
  });
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks);
    const body = rawBody.toString('utf8');
    console.log(`[receiver] 收到请求: ${req.method} ${requestPath}`);
    console.log(`[receiver] content-type: ${req.headers['content-type'] || ''}`);

    try {
      const payload = JSON.parse(body);
      const summary = summarize(payload);
      console.log('[receiver] payload 摘要:');
      console.log(JSON.stringify(summary, null, 2));
    } catch (_error) {
      console.log('[receiver] 无法解析为 JSON，输出原始字节长度和前 48 字节十六进制');
      console.log(
        JSON.stringify(
          {
            bodyLength: rawBody.length,
            previewHex: rawBody.subarray(0, 48).toString('hex'),
          },
          null,
          2
        )
      );
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
});

server.listen(port, () => {
  console.log(`[receiver] 已监听 http://127.0.0.1:${port}${basePath}`);
  console.log(
    `[receiver] 同时接受 http://127.0.0.1:${port}${normalizePath(
      `${basePath}/v1/traces`
    )}`
  );
});

function normalizePath(pathname) {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

function summarize(payload) {
  const services = new Set();
  const spanNames = [];
  let spanCount = 0;

  for (const resourceSpan of payload.resourceSpans || []) {
    const attributes = resourceSpan.resource?.attributes || [];
    for (const attribute of attributes) {
      if (attribute.key === 'service.name') {
        services.add(attribute.value?.stringValue || '');
      }
    }

    for (const scopeSpan of resourceSpan.scopeSpans || []) {
      for (const span of scopeSpan.spans || []) {
        spanCount += 1;
        spanNames.push(span.name);
      }
    }
  }

  return {
    resourceSpanCount: (payload.resourceSpans || []).length,
    spanCount,
    services: Array.from(services),
    spanNames,
  };
}
