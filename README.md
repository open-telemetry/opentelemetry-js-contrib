# OpenTelemetry JavaScript Contrib
This is a repository for OpenTelemetry JavaScript contributions that are not part of the
[core repository](https://github.com/open-telemetry/opentelemetry-js) and
core distribution of the API and SDK.

## Plugins

OpenTelemetry can collect tracing data automatically using plugins. Vendors/Users can also create and use their own. Currently, OpenTelemetry supports automatic tracing for:

#### Node Plugins
- [@opentelemetry/plugin-grpc][otel-plugin-grpc]
- [@opentelemetry/plugin-http][otel-plugin-http]
- [@opentelemetry/plugin-https][otel-plugin-https]
- [@opentelemetry/plugin-mongodb][otel-plugin-mongodb]
- [@opentelemetry/plugin-mysql][otel-plugin-mysql]
- [@opentelemetry/plugin-pg][otel-plugin-pg]
- [@opentelemetry/plugin-pg-pool][otel-plugin-pg-pool]
- [@opentelemetry/plugin-redis][otel-plugin-redis]
- [@opentelemetry/plugin-ioredis][otel-plugin-ioredis]
- [@opentelemetry/plugin-dns][otel-plugin-dns] - By default, this plugin is not loaded [#612](https://github.com/open-telemetry/opentelemetry-js/issues/612)
- [@opentelemetry/plugin-express][otel-plugin-express] - By default, this plugin is not loaded

#### Web Plugins
- [@opentelemetry/plugin-document-load][otel-plugin-document-load]
- [@opentelemetry/plugin-xml-http-request][otel-plugin-xml-http-request]
- [@opentelemetry/plugin-user-interaction][otel-plugin-user-interaction]

## Supported Runtimes

Platform Version | Supported
---------------- | ---------
Node.JS `v14`    | ✅
Node.JS `v13`    | ✅
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

## Useful links
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For help or feedback on this project, join us on [gitter][node-gitter-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[node-gitter-url]: https://gitter.im/open-telemetry/opentelemetry-node?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/master/LICENSE
[otel-plugin-grpc]: https://github.com/open-telemetry/opentelemetry-js/tree/master/packages/opentelemetry-plugin-grpc
[otel-plugin-http]: https://github.com/open-telemetry/opentelemetry-js/tree/master/packages/opentelemetry-plugin-http
[otel-plugin-https]: https://github.com/open-telemetry/opentelemetry-js/tree/master/packages/opentelemetry-plugin-https
[otel-plugin-dns]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/master/plugins/node/opentelemetry-plugin-dns
[otel-plugin-document-load]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/master/plugins/web/opentelemetry-plugin-document-load
[otel-plugin-ioredis]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/master/plugins/node/opentelemetry-plugin-ioredis
[otel-plugin-mongodb]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/master/plugins/node/opentelemetry-plugin-mongodb
[otel-plugin-mysql]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/master/plugins/node/opentelemetry-plugin-mysql
[otel-plugin-pg-pool]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/master/plugins/node/opentelemetry-plugin-pg-pool
[otel-plugin-pg]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/master/plugins/node/opentelemetry-plugin-pg
[otel-plugin-redis]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/master/plugins/node/opentelemetry-plugin-redis
[otel-plugin-user-interaction]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/master/plugins/web/opentelemetry-plugin-user-interaction
[otel-plugin-xml-http-request]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/master/plugins/web/opentelemetry-plugin-xml-http-request
[otel-plugin-express]: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/master/plugins/node/opentelemetry-plugin-express
