---
<p align="center">
  <strong>
    <a href="https://github.com/open-telemetry/opentelemetry-js/blob/main/getting-started/README.md">Getting Started<a/>
    &nbsp;&nbsp;&bull;&nbsp;&nbsp;
    <a href="https://open-telemetry.github.io/opentelemetry-js">API Documentation<a/>
  </strong>
</p>

<p align="center">
  <a href="https://github.com/open-telemetry/opentelemetry-js-contrib/releases">
    <img alt="GitHub release (latest by date including pre-releases)" src="https://img.shields.io/github/v/release/open-telemetry/opentelemetry-js?include_prereleases&style=for-the-badge">
  </a>
  <a href="https://codecov.io/gh/open-telemetry/opentelemetry-js-contrib/branch/main/">
    <img alt="Codecov Status" src="https://img.shields.io/codecov/c/github/open-telemetry/opentelemetry-js-contrib?style=for-the-badge">
  </a>
  <a href="https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE">
    <img alt="license" src="https://img.shields.io/badge/license-Apache_2.0-green.svg?style=for-the-badge">
  </a>
  <br/>
  <a href="https://circleci.com/gh/open-telemetry/opentelemetry-js-contrib">
    <img alt="Build Status" src="https://circleci.com/gh/open-telemetry/opentelemetry-js-contrib.svg?style=shield">
  </a>
  <img alt="Beta" src="https://img.shields.io/badge/status-beta-informational?logo=data:image/png;base64,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">
</p>

<p align="center">
  <strong>
    <a href="CONTRIBUTING.md">Contributing<a/>
    &nbsp;&nbsp;&bull;&nbsp;&nbsp;
    <a href="plugins/">Instrumentations<a/>
    &nbsp;&nbsp;&bull;&nbsp;&nbsp;
    <a href="propagators/">Propagators<a/>
    &nbsp;&nbsp;&bull;&nbsp;&nbsp;
    <a href="examples/">Examples<a/>
  </strong>
</p>

---

## About this project

This is a repository for OpenTelemetry JavaScript contributions that are not part of the
[core repository](https://github.com/open-telemetry/opentelemetry-js) and
core distribution of the API and SDK.

## Instrumentations

OpenTelemetry can collect tracing data automatically using instrumentations. Vendors/Users can also create and use their own. Currently, OpenTelemetry supports automatic tracing for:

### Node Instrumentations

- [@opentelemetry/instrumentation-aws-lambda][otel-contrib-instrumentation-aws-lambda]
- [@opentelemetry/instrumentation-aws-sdk][otel-contrib-instrumentation-aws-sdk]
- [@opentelemetry/instrumentation-bunyan][otel-contrib-instrumentation-bunyan]
- [@opentelemetry/instrumentation-cassandra-driver][otel-contrib-instrumentation-cassandra]
- [@opentelemetry/instrumentation-connect][otel-contrib-instrumentation-connect]
- [@opentelemetry/instrumentation-dns][otel-contrib-instrumentation-dns]
- [@opentelemetry/instrumentation-express][otel-contrib-instrumentation-express]
- [@opentelemetry/instrumentation-fastify][otel-contrib-instrumentation-fastify]
- [@opentelemetry/instrumentation-generic-pool][otel-contrib-instrumentation-generic-pool]
- [@opentelemetry/instrumentation-graphql][otel-contrib-instrumentation-graphql]
- [@opentelemetry/instrumentation-grpc][otel-instrumentation-grpc]
- [@opentelemetry/instrumentation-hapi][otel-contrib-instrumentation-hapi]
- [@opentelemetry/instrumentation-http][otel-instrumentation-http]
- [@opentelemetry/instrumentation-ioredis][otel-contrib-instrumentation-ioredis]
- [@opentelemetry/instrumentation-knex][otel-contrib-instrumentation-knex]
- [@opentelemetry/instrumentation-koa][otel-contrib-instrumentation-koa]
- [@opentelemetry/instrumentation-memcached][otel-contrib-instrumentation-memcached]
- [@opentelemetry/instrumentation-mongodb][otel-contrib-instrumentation-mongodb]
- [@opentelemetry/instrumentation-mysql2][otel-contrib-instrumentation-mysql2]
- [@opentelemetry/instrumentation-mysql][otel-contrib-instrumentation-mysql]
- [@opentelemetry/instrumentation-nestjs-core][otel-contrib-instrumentation-nestjs-core]
- [@opentelemetry/instrumentation-net][otel-contrib-instrumentation-net]
- [@opentelemetry/instrumentation-pg][otel-contrib-instrumentation-pg]
- [@opentelemetry/instrumentation-pino][otel-contrib-instrumentation-pino]
- [@opentelemetry/instrumentation-redis][otel-contrib-instrumentation-redis]
- [@opentelemetry/instrumentation-restify][otel-contrib-instrumentation-restify]
- [@opentelemetry/instrumentation-router][otel-contrib-instrumentation-router]
- [@opentelemetry/instrumentation-tedious][otel-contrib-instrumentation-tedious]
- [@opentelemetry/instrumentation-winston][otel-contrib-instrumentation-winston]

### Web Instrumentations

- [@opentelemetry/instrumentation-document-load][otel-contrib-instrumentation-document-load]
- [@opentelemetry/instrumentation-fetch][otel-instrumentation-fetch]
- [@opentelemetry/instrumentation-long-task][otel-contrib-instrumentation-long-task]
- [@opentelemetry/instrumentation-user-interaction][otel-contrib-instrumentation-user-interaction]
- [@opentelemetry/instrumentation-xml-http-request][otel-instrumentation-xml-http-request]
- [@opentelemetry/plugin-react-load][otel-contrib-plugin-react-load]

### Metapackages

Multiple instrumentations may be leveraged via metapackages.

- [@opentelemetry/auto-instrumentations-node][otel-contrib-auto-instr-node] - Metapackage which bundles opentelemetry node core and contrib instrumentations
- [@opentelemetry/auto-instrumentations-web][otel-contrib-auto-instr-web] - Metapackage which bundles opentelemetry web core and contrib instrumentations

## Resource Detectors

OpenTelemetry can collect resource attributes of the entity that producing telemetry. For example, a process producing telemetry that is running in a container on Kubernetes has a Pod name, it is in a namespace and possibly is part of a Deployment which also has a name. All three of these attributes can be included in the `Resource`.

Currently, OpenTelemetry supports automatic collection for following environments:

- [@opentelemetry/resource-detector-alibaba-cloud][otel-contrib-resource-detector-alibaba-cloud]
- [@opentelemetry/resource-detector-aws][otel-contrib-resource-detector-aws]
- [@opentelemetry/resource-detector-gcp][otel-contrib-resource-detector-gcp]
- [@opentelemetry/resource-detector-github][otel-contrib-resource-detector-github]

## Supported Runtimes

Platform Version | Supported
---------------- | ---------
Node.JS `v16`    | ✅
Node.JS `v14`    | ✅
Node.JS `v12`    | ✅
Node.JS `v10`    | ✅
Node.JS `v8`     | See [Node Support](#node-support) below
Web Browsers     | ✅ See [Browser Support](#browser-support) below

### Node Support

Automated tests are run using the latest release of each currently active version of Node.JS.
While Node.JS v8 and v10 are no longer supported by the Node.JS team, the latest versions of Node.JS v8 and v10 are still included in our testing suite.
Please note that versions of Node.JS v8 prior to `v8.5.0` will NOT work, because OpenTelemetry Node depends on the `perf_hooks` module introduced in `v8.5.0`

### Browser Support

Automated browser tests are run in the latest version of Headless Chrome.
There is currently no list of officially supported browsers, but OpenTelemetry is developed using standard web technologies with wide support and should work in currently supported versions of major browsers.

## Contributing

We'd love your help!. Use tags [up-for-grabs][up-for-grabs-issues] and
[good first issue][good-first-issues] to get started with the project. Follow
[CONTRIBUTING](CONTRIBUTING.md) guide to report issues or submit a proposal.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[up-for-grabs-issues]: https://github.com/open-telemetry/opentelemetry-js-contrib/issues?q=is%3Aissue+is%3Aopen+label%3Aup-for-grabs
[good-first-issues]: https://github.com/open-telemetry/openTelemetry-js-contrib/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22

[otel-instrumentation-fetch]: https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/opentelemetry-instrumentation-fetch
[otel-instrumentation-grpc]: https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/opentelemetry-instrumentation-grpc
[otel-instrumentation-http]: https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/opentelemetry-instrumentation-http
[otel-instrumentation-xml-http-request]: https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/opentelemetry-instrumentation-xml-http-request

[otel-contrib-instrumentation-aws-lambda]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-aws-lambda
[otel-contrib-instrumentation-aws-sdk]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-aws-sdk
[otel-contrib-instrumentation-bunyan]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-bunyan
[otel-contrib-instrumentation-cassandra]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-cassandra
[otel-contrib-instrumentation-connect]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-connect
[otel-contrib-instrumentation-dns]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-dns
[otel-contrib-instrumentation-document-load]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/web/opentelemetry-instrumentation-document-load
[otel-contrib-instrumentation-express]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-express
[otel-contrib-instrumentation-fastify]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-fastify
[otel-contrib-instrumentation-generic-pool]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-generic-pool
[otel-contrib-instrumentation-graphql]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-graphql
[otel-contrib-instrumentation-hapi]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-hapi
[otel-contrib-instrumentation-ioredis]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-ioredis
[otel-contrib-instrumentation-knex]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-knex
[otel-contrib-instrumentation-koa]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-koa
[otel-contrib-instrumentation-long-task]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/web/opentelemetry-instrumentation-long-task
[otel-contrib-instrumentation-memcached]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-memcached
[otel-contrib-instrumentation-mongodb]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-mongodb
[otel-contrib-instrumentation-mysql2]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-mysql2
[otel-contrib-instrumentation-mysql]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-mysql
[otel-contrib-instrumentation-nestjs-core]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-nestjs-core
[otel-contrib-instrumentation-net]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-net
[otel-contrib-instrumentation-pg]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-pg
[otel-contrib-instrumentation-pino]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-pino
[otel-contrib-instrumentation-redis]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-redis
[otel-contrib-instrumentation-restify]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-restify
[otel-contrib-instrumentation-router]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-router
[otel-contrib-instrumentation-tedious]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/instrumentation-tedious
[otel-contrib-instrumentation-user-interaction]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/web/opentelemetry-instrumentation-user-interaction
[otel-contrib-instrumentation-winston]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-winston
[otel-contrib-plugin-react-load]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/web/opentelemetry-plugin-react-load

[otel-contrib-auto-instr-node]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/metapackages/auto-instrumentations-node
[otel-contrib-auto-instr-web]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/metapackages/auto-instrumentations-web

[otel-contrib-resource-detector-alibaba-cloud]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/detectors/node/opentelemetry-resource-detector-alibaba-cloud
[otel-contrib-resource-detector-aws]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/detectors/node/opentelemetry-resource-detector-aws
[otel-contrib-resource-detector-gcp]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/detectors/node/opentelemetry-resource-detector-gcp
[otel-contrib-resource-detector-github]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/detectors/node/opentelemetry-resource-detector-github
