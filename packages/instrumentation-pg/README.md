# OpenTelemetry Postgres Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`pg`](https://github.com/brianc/node-postgres)module.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-pg
```

### Supported Versions

- [`pg`](https://www.npmjs.com/package/pg) versions `>=8.0.3 <9`
- [`pg-pool`](https://www.npmjs.com/package/pg-pool) versions `>=2.0.0 <4`

## Usage

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');

const sdk = new NodeSDK({
  instrumentations: [
    new PgInstrumentation(),
  ],
});
sdk.start();
process.once('beforeExit', async () => { await sdk.shutdown(); });
```

PgInstrumentation contains both pg and [`pg.Pool`](https://node-postgres.com/api/pool) so it will be instrumented automatically.

### Span Types Created

This instrumentation creates the following span types:

| Span Name | Description | When Created |
| --------- | ----------- | ------------ |
| `pg.query:<OPERATION> <database>` | Database query execution | When `client.query()` is called |
| `pg.connect` | Client connection to database | When `new Client().connect()` is called directly |
| `pg-pool.connect` | Pool connection acquisition wait time | When acquiring a connection from `pg-pool` |

The `pg-pool.connect` spans measure the time spent waiting to acquire a connection from the pool. This can be valuable for identifying connection pool exhaustion or sizing issues. However, in high-throughput scenarios where connections are readily available, these spans may add noise with minimal diagnostic value. Consider using the `requireParentSpan` option or sampling strategies if pool connect spans become excessive.

### PostgreSQL Instrumentation Options

PostgreSQL instrumentation has few options available to choose from. You can set the following:

| Options | Type | Description |
| ------- | ---- | ----------- |
| `enhancedDatabaseReporting` | `boolean` | If true, additional information about query parameters and results will be attached (as `attributes`) to spans representing database operations |
| `requestHook` | `PgInstrumentationExecutionRequestHook` (function) | Function for adding custom span attributes using information about the query being issued and the db to which it's directed |
| `responseHook` | `PgInstrumentationExecutionResponseHook` (function) | Function for adding custom span attributes from db response |
| `requireParentSpan` | `boolean` | If true, requires a parent span to create new spans (default false) |
| `addSqlCommenterCommentToQueries` | `boolean` | If true, adds [sqlcommenter](https://github.com/open-telemetry/opentelemetry-sqlcommenter) specification compliant comment to queries with tracing context (default false). _NOTE: A comment will not be added to queries that already contain `--` or `/* ... */` in them, even if these are not actually part of comments_ |
| `ignoreConnectSpans` | `boolean` | If true, `pg.connect` and `pg-pool.connect` spans will not be created. Query spans and pool metrics are still recorded (default false) |
| `skipQueryTextSanitization` | `boolean` | If true, the `db.query.text` attribute is recorded as-is instead of being masked by `maskStatementHook` (default false, i.e. masked by default). The query sent to the server is never modified |
| `maskStatementHook` | `PgInstrumentationQueryMaskingHook` (function) | Function used to mask `db.query.text` unless `skipQueryTextSanitization` is true. Defaults to `sanitizeSql` from [`@opentelemetry/sql-common`](../sql-common). If it throws or returns a non-string, `db.query.text` is omitted |
| `enableTraceContextPropagation` | `boolean` | If true, injects the current span's W3C traceparent into the PostgreSQL session via `SET application_name` before each query (default false). _NOTE: this adds a round-trip per query_ |

## Semantic Conventions

The `@opentelemetry/instrumentation-pg` versions 0.72.0 and later emit the stable v1.34.0+ semantic conventions.

### Attributes collected

| Attribute             | Short Description                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `db.system.name`      | The database management system (DBMS) product as identified by the client instrumentation. |
| `db.namespace`        | The name of the database, fully qualified within the server address and port.              |
| `db.query.text`       | The database query being executed.                                                         |
| `db.operation.name`   | The name of the operation or command being executed.                                       |
| `server.address`      | Remote hostname or similar.                                                                |
| `server.port`         | Remote port number.                                                                        |
| `error.type`          | Describes a class of error the operation ended with.                                       |

> [!NOTE]
> `db.collection.name` is not collected. The `pg` driver does not expose the table
> name separately, and the OpenTelemetry specification advises against parsing
> `db.query.text` when the database supports queries touching multiple
> collections in non-batch operations, which is the case for PostgreSQL.

### Masking `db.query.text`

The `pg` driver never interpolates parameter values into the query text, so a
parameterized query records placeholders rather than values — which is why
the specification advises against
[sanitizing](https://opentelemetry.io/docs/specs/semconv/database/database-spans/#sanitization-of-dbquerytext)
parameterized query text. A parameterized call (one made with a `values`
array) always has its `db.query.text` recorded exactly as passed to
`client.query()`, regardless of `skipQueryTextSanitization`.

Applications that build SQL by string concatenation put literals into the query
text, and therefore onto the span. For a non-parameterized query, `db.query.text`
is masked by default to strip those out; set `skipQueryTextSanitization: true`
to record it verbatim instead. By default:

- string, numeric, bit-string and dollar-quoted literals become `?`
- `--` and (nestable) `/* */` comments are removed
- runs of whitespace collapse to a single space
- `$n` parameter placeholders and identifiers, including `"quoted"` ones, are preserved
- the result is truncated at 32 KiB

So `SELECT * FROM users WHERE email = 'a@b.c' -- lookup` is recorded as
`SELECT * FROM users WHERE email = ?`, while
`SELECT * FROM users WHERE id = $1` is recorded unchanged.

Limits worth knowing:

- Only `db.query.text` is masked. The query sent to PostgreSQL is untouched, and
  `requestHook` still receives the original text.
- `db.operation.name` and the span name are derived from the raw query text, not
  the masked text -- and because `db.operation.name` is also a dimension of the
  `db.client.operation.duration` metric, that text reaches metrics as well.
  Only the leading keyword is used, though, so this is limited to the SQL
  command name (`SELECT`, `INSERT`, etc.), never a literal.
- Double-quoted identifiers are preserved, because in PostgreSQL `"` delimits an
  identifier rather than a string literal. An application that quotes _dynamic_
  identifiers should supply its own `maskStatementHook`.
- `db.postgresql.values` (see `enhancedDatabaseReporting`) and
  `db.postgresql.plan` (the prepared-statement name) are not masked. Enabling
  `enhancedDatabaseReporting` records masked query text alongside raw parameter
  values, unless `skipQueryTextSanitization` is also set.
- If `maskStatementHook` throws or returns a non-string, `db.query.text` is
  omitted rather than falling back to the raw text, and a warning is logged
  through the API diagnostic logger.
- The default hook assumes `standard_conforming_strings` is on, which has been
  PostgreSQL's default since version 9.1. A server with it explicitly turned
  off can use a backslash to escape a quote inside an ordinary string, which
  the default hook does not account for and can mask incorrectly.

Metrics Exported:

- [`db.client.operation.duration`](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/database/database-metrics.md#metric-dbclientoperationduration)
- [`db.client.connection.count`](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/database/database-metrics.md#metric-dbclientconnectioncount)
- [`db.client.connection.pending_requests`](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/database/database-metrics.md#metric-dbclientconnectionpending_requests)

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-pg
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-pg.svg
