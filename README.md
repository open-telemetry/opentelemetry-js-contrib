---
<p align="center">
  <strong>
    <a href="https://github.com/open-telemetry/opentelemetry-js/blob/main/getting-started/README.md">Getting Started<a/>
    &nbsp;&nbsp;&bull;&nbsp;&nbsp;
    <a href="https://open-telemetry.github.io/opentelemetry-js">API Documentation<a/>
    &nbsp;&nbsp;&bull;&nbsp;&nbsp;
    <a href="https://gitter.im/open-telemetry/opentelemetry-node">Getting In Touch (Gitter)<a/>
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
    <a href="plugins/">Plugins<a/>
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

## Plugins

OpenTelemetry can collect tracing data automatically using plugins. Vendors/Users can also create and use their own. Currently, OpenTelemetry supports automatic tracing for:

### Node Plugins

- [@opentelemetry/plugin-grpc][otel-plugin-grpc]
- [@opentelemetry/plugin-http][otel-plugin-http]
- [@opentelemetry/plugin-https][otel-plugin-https]
- [@opentelemetry/plugin-mongodb][otel-plugin-mongodb]
- [@opentelemetry/plugin-mysql][otel-plugin-mysql]
- [@opentelemetry/plugin-pg][otel-plugin-pg]
- [@opentelemetry/plugin-pg-pool][otel-plugin-pg-pool]
- [@opentelemetry/plugin-redis][otel-plugin-redis]
- [@opentelemetry/plugin-ioredis][otel-plugin-ioredis]
- [@opentelemetry/plugin-express][otel-plugin-express]
- [@opentelemetry/plugin-dns][otel-plugin-dns]
- [@opentelemetry/hapi-instrumentation][otel-contrib-hapi-instrumentation]
- [@opentelemetry/koa-instrumentation][otel-contrib-koa-instrumentation]
- [@opentelemetry/instrumentation-graphql][otel-contrib-instrumentation-graphql]

### Web Plugins

- [@opentelemetry/plugin-document-load][otel-plugin-document-load]
- [@opentelemetry/plugin-xml-http-request][otel-plugin-xml-http-request]
- [@opentelemetry/plugin-user-interaction][otel-plugin-user-interaction]
- [@opentelemetry/plugin-react-load][otel-plugin-react-load]

### Metapackages

Multiple plugins may be leveraged via metapackages.

- [@opentelemetry/plugins-node-core-and-contrib][otel-plugins-node-core-and-contrib] - all officially supported core and contrib plugins.

## Supported Runtimes

Platform Version | Supported
---------------- | ---------
Node.JS `v14`    | ✅
Node.JS `v12`    | ✅
Node.JS `v10`    | ✅
Node.JS `v8`     | See [Node Support](#node-support) below
Web Browsers     | ✅ See [Browser Support](#browser-support) below

### Node Support
Automated tests are run using the latest release of each currently active version of Node.JS.
While Node.JS v8 is no longer supported by the Node.JS team, the latest version of Node.JS v8 is still included in our testing suite.
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
- For help or feedback on this project, join us on [gitter][node-gitter-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[node-gitter-url]: https://gitter.im/open-telemetry/opentelemetry-node?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[up-for-grabs-issues]: https://github.com/open-telemetry/opentelemetry-js-contrib/issues?q=is%3Aissue+is%3Aopen+label%3Aup-for-grabs
[good-first-issues]: https://github.com/open-telemetry/openTelemetry-js-contrib/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22
[otel-plugin-grpc]: https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-plugin-grpc
[otel-plugin-http]: https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-plugin-http
[otel-plugin-https]: https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-plugin-https
[otel-plugin-dns]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-plugin-dns
[otel-plugin-document-load]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/web/opentelemetry-plugin-document-load
[otel-plugin-react-load]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/web/opentelemetry-plugin-react-load
[otel-plugin-ioredis]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-plugin-ioredis
[otel-plugin-mongodb]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-plugin-mongodb
[otel-plugin-mysql]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-plugin-mysql
[otel-plugin-pg-pool]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-plugin-pg-pool
[otel-plugin-pg]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-plugin-pg
[otel-plugin-redis]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-plugin-redis
[otel-plugin-user-interaction]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/web/opentelemetry-plugin-user-interaction
[otel-plugin-xml-http-request]: https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-plugin-xml-http-request
[otel-plugin-express]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-plugin-express
[otel-plugins-node-core-and-contrib]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/metapackages/plugins-node-core-and-contrib
[otel-contrib-hapi-instrumentation]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-hapi-instrumentation
[otel-contrib-koa-instrumentation]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-koa-instrumentation
[otel-contrib-instrumentation-graphql]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-graphql
