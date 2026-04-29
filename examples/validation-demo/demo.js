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

const { trace, SpanStatusCode } = require('@opentelemetry/api');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} = require('@opentelemetry/sdk-trace-base');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');

const serviceName = process.env.OTEL_SERVICE_NAME || 'validation-demo';
const otlpBaseEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:9529/otel';
const otlpTracesEndpoint =
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
  appendPath(otlpBaseEndpoint, 'v1/traces');
const port = Number(process.env.DEMO_PORT || 8089);

const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  }),
  spanProcessors: [
    new SimpleSpanProcessor(
      new OTLPTraceExporter({
        url: otlpTracesEndpoint,
      })
    ),
    new SimpleSpanProcessor(new ConsoleSpanExporter()),
  ],
});

provider.register();

registerInstrumentations({
  tracerProvider: provider,
  instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
});

const tracer = trace.getTracer(serviceName);
const express = require('express');
const axios = require('axios').default;
const app = express();

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/work', async (req, res) => {
  await tracer.startActiveSpan('validation.business', async span => {
    try {
      await sleep(120);
      span.setAttribute('validation.user', String(req.query.user || 'demo'));
      span.setAttribute('validation.mode', 'self-check');
      span.setStatus({ code: SpanStatusCode.OK });

      const context = span.spanContext();
      res.json({
        ok: true,
        message: 'validation data generated',
        traceId: context.traceId,
        spanId: context.spanId,
        exporterEndpoint: otlpTracesEndpoint,
      });
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      res.status(500).json({
        ok: false,
        error: error.message,
      });
    } finally {
      span.end();
    }
  });
});

async function main() {
  const server = await listen(app, port);
  console.log(`[demo] service started: http://127.0.0.1:${port}`);
  console.log(`[demo] trace base endpoint: ${otlpBaseEndpoint}`);
  console.log(`[demo] effective trace export endpoint: ${otlpTracesEndpoint}`);

  try {
    await tracer.startActiveSpan('validation.run', async span => {
      try {
        const traceContext = span.spanContext();
        console.log(
          `[demo] sending validation request, root span traceId=${traceContext.traceId}`
        );

        const response = await axios.get(`http://127.0.0.1:${port}/work`, {
          params: {
            user: 'otel-demo',
          },
        });

        console.log('[demo] service response:');
        console.log(JSON.stringify(response.data, null, 2));
        span.setAttribute('validation.response.status', response.status);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.recordException(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  } finally {
    await provider.forceFlush();
    await closeServer(server);
    await provider.shutdown();
  }
}

main().catch(error => {
  console.error('[demo] demo failed:', error);
  process.exitCode = 1;
});

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function listen(serverApp, serverPort) {
  return new Promise((resolve, reject) => {
    const server = serverApp.listen(serverPort, error => {
      if (error) {
        reject(error);
        return;
      }
      resolve(server);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function appendPath(baseUrl, path) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path, normalizedBase).toString();
}
