# OpenTelemetry ibmmq Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`ibmmq`](https://www.npmjs.com/package/ibmmq) module, the official Node.js client for IBM MQ.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](https://www.npmjs.com/package/@opentelemetry/sdk-node) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-ibmmq
```

### Supported Versions

- [`ibmmq`](https://www.npmjs.com/package/ibmmq) versions `>=2.0.0 <3`

## Usage

OpenTelemetry ibmmq Instrumentation allows the user to automatically collect trace data and export them to the backend of choice, to give observability to distributed systems when working with [`ibmmq`](https://github.com/ibm-messaging/mq-mqi-nodejs).

To enable a specific instrumentation, pass it to `registerInstrumentations()`.
This is commonly done via `NodeSDK` for fully setting up all OpenTelemetry SDK components:

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { IbmMqInstrumentation } = require('@opentelemetry/instrumentation-ibmmq');

const sdk = new NodeSDK({
  instrumentations: [
    new IbmMqInstrumentation({
      // emitQueueManagerId: true,
    }),
  ],
});
sdk.start();
process.once('beforeExit', async () => { await sdk.shutdown(); });
```

This instrumentation supports zero-code setup via `--require @opentelemetry/auto-instrumentations-node/register` (or `--import` for ESM). That entry point has no per-instrumentation configuration hook, so `emitQueueManagerId` also falls back to an environment variable - see [Queue Manager Identifier (QMID)](#queue-manager-identifier-qmid) below.

### ibmmq Instrumentation Options

| Option                | Type      | Default                                                              | Description                                                              |
| ---------------------- | --------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `emitQueueManagerId`  | `boolean` | `process.env.OTEL_INSTRUMENTATION_IBMMQ_EMIT_QUEUE_MANAGER_ID === 'true'` | Stamp the IBM MQ Queue Manager Identifier (QMID) onto every span. See below. |

### Propagation

Trace context propagation across a queue is handled entirely by the `ibmmq` package's own `lib/mqiotel.js`, which injects `traceparent`/`tracestate` message properties on publish and adds a link to the active span when a message carrying them is consumed. This instrumentation writes no propagation code of its own and exposes no option to configure it.

Parent-child linkage (rather than a link) between a producer's send span and a consumer's process span is a possible future option, but it would require disabling `ibmmq`'s built-in propagation (`MQIJS_NOOTEL=1`) and implementing our own `propagation.extract`/inject in its place.

## Semantic Conventions

This package uses `messaging.system`, `messaging.destination.name`, `messaging.operation.name`, and `messaging.operation.type` from the [OpenTelemetry Semantic Conventions](https://github.com/open-telemetry/semantic-conventions), plus the not-yet-ratified `messaging.ibmmq.queue_manager.id` described below.

### Spans Emitted

This instrumentation creates spans for the following `ibmmq` operations:

| Operation                          | Span name                | Span kind  |
| ----------------------------------- | ------------------------- | ---------- |
| `Put` / `PutSync` / `Put1` / `Put1Sync` | `send <queue>`            | `PRODUCER` |
| `GetSync`                          | `receive <queue>`         | `CLIENT`   |
| `Get` (per delivered message)      | `process <queue>`         | `CONSUMER` |

`Conn` / `Connx` / `ConnSync` / `ConnxSync` do not produce a span; they only record connection metadata used by the QMID lookup below.

### Queue Manager Identifier (QMID)

IBM MQ's `MQCA_Q_MGR_IDENTIFIER` is a globally unique identifier for a queue manager, unlike its name, which can collide across hosts. When `emitQueueManagerId` is enabled, this instrumentation reads it once per connection (never per message) and stamps it as `messaging.ibmmq.queue_manager.id` on every send/receive/process span for that connection.

This attribute is not yet part of `@opentelemetry/semantic-conventions` (it tracks an unratified proposal) and costs one extra network round trip per connection, so it is disabled by default. Enable it either through the constructor option above, or, when running with `--require @opentelemetry/auto-instrumentations-node/register`, through:

```bash
OTEL_INSTRUMENTATION_IBMMQ_EMIT_QUEUE_MANAGER_ID=true
```

## Testing

This package has no `.tav.yml` and no integration test against the real `ibmmq` package. `ibmmq` is a native N-API addon whose `postinstall` downloads the IBM MQ redistributable C client from `public.dhe.ibm.com`, which is not acceptable as a transitive `npm install` side effect of this monorepo. Instead, `test/ibmmq.test.ts` drives a small hand-built stand-in for the module's exports directly - it never `require`s the real `ibmmq`. Please do not "fix" this by adding `ibmmq` back as a dependency; the fake-module approach is deliberate.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-ibmmq
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-ibmmq.svg
