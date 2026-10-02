# OpenTelemetry redis Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`redis`](https://github.com/NodeRedis/node_redis) module versions `>=2.6.0 <6`.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](https://www.npmjs.com/package/@opentelemetry/sdk-node) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-redis
```

### Supported Versions

- [`redis`](https://www.npmjs.com/package/redis) versions `>=2.6.0 <7`

## Usage

OpenTelemetry Redis Instrumentation allows the user to automatically collect trace data and export them to the backend of choice, to give observability to distributed systems when working with [redis](https://www.npmjs.com/package/redis).

To enable a specific instrumentation, pass it to `registerInstrumentations()`.
This is commonly done via `NodeSDK` for fully setting up all OpenTelemetry SDK components:

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { RedisInstrumentation } = require('@opentelemetry/instrumentation-redis');

const sdk = new NodeSDK({
  instrumentations: [
    new RedisInstrumentation(),
  ],
});
sdk.start();
process.once('beforeExit', async () => { await sdk.shutdown(); });
```

See [examples/redis](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/examples/redis) for a short example.

### Redis Instrumentation Options

Redis instrumentation has a few options available to choose from. You can set the following:

| Options                 | Type                                              | Description                                                                                                    |
|-------------------------|---------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| `dbStatementSerializer` | `DbStatementSerializer` (function)                | Redis instrumentation will serialize the command to the `db.statement` attribute using the specified function. |
| `responseHook`          | `RedisResponseCustomAttributeFunction` (function) | Function for adding custom attributes on db response. Receives params: `span, moduleVersion, cmdName, cmdArgs` |
| `requireParentSpan`     | `boolean`                                         | Require parent to create redis span, default when unset is false.                                              |
| `serializeKeys`         | `boolean`                                         | Serialize the key for commands that accept only keys, masked with `maskStatementHook`. Default is false.       |
| `maskStatementHook`     | `DbStatementMaskingHook` (function)               | Hook used to mask the statement when `serializeKeys` is true.                                                  |

#### Custom `db.statement` Serializer

The instrumentation serializes the command into a Span attribute called `db.statement`. The standard serialization format attempts to be as informative as possible while avoiding the export of potentially sensitive data. The number of serialized arguments depends on the specific command, see the configuration
list in `@opentelemetry/redis-common`.

It is also possible to define a custom serialization function. The function
will receive the command name and arguments and must return a string.

Here is a simple example to serialize the command name and all command arguments.
Notice that it might capture sensitive data and big payloads:

```javascript
const { RedisInstrumentation } = require('@opentelemetry/instrumentation-redis');

const redisInstrumentation = new RedisInstrumentation({
  dbStatementSerializer: function (cmdName, cmdArgs) {
    return [cmdName, ...cmdArgs].join(" ");
  },
});
```

#### Serializing redis keys

By default, commands that accept only a key are serialized without it, so every
call looks the same:

```text
HGETALL [1 other arguments]
TTL [1 other arguments]
```

Set `serializeKeys` to `true` to record the key instead. Segments that identify
a single entity are replaced with `?`, so the key pattern is visible without
`db.query.text` becoming high cardinality:

```javascript
const { RedisInstrumentation } = require('@opentelemetry/instrumentation-redis');

const instrumentation = new RedisInstrumentation({
  serializeKeys: true,
});
```

| default | `serializeKeys: true` |
| --- | --- |
| `HGETALL [1 other arguments]` | `HGETALL player:?:stats` |
| `HGETALL [1 other arguments]` | `HGETALL tournament:leaderboard:sc:daily` |
| `TTL [1 other arguments]` | `TTL auth_revoked:?` |
| `MGET [2 other arguments]` | `MGET player:?:stats player:?:stats` |
| `SET session:42 [1 other arguments]` | `SET session:? [1 other arguments]` |

Only commands whose arguments are keys, hash fields, patterns, numbers or fixed
tokens are affected. Commands that accept values, such as `SET`, `HSET` and
`EVAL`, keep their values redacted either way.

A segment is masked when it looks like a number, uuid, hex digest, ulid or email
address. Segments that describe a class of keys, such as `queue:high` or
`feature_flags`, are left alone, as is the command name.

Pass `maskStatementHook` to replace the masking rule, or
`statement => statement` to record keys unmasked:

```javascript
const instrumentation = new RedisInstrumentation({
  serializeKeys: true,
  maskStatementHook: statement => statement.replace(/tenant:[^\s]+/g, 'tenant:?'),
});
```

## Semantic Conventions

The `instrumentation-redis` versions 0.68.0 and later emit the stable v1.33.0+ semantic conventions.

| Attribute           | Short Description                                    |
|---------------------|------------------------------------------------------|
| `db.operation.name` | Redis command name                                   |
| `db.query.text`     | The database query being executed                    |
| `db.system.name`    | Database identifier; always `redis`                  |
| `server.address`    | Hostname or IP of the connected Redis server         |
| `server.port`       | Port of the connected Redis server                   |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-redis
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-redis.svg
