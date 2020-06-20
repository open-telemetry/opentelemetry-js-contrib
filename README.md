# OpenTelemetry JavaScript Contrib

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
- [@opentelemetry/plugin-dns][otel-plugin-dns] - By default, this plugin is not loaded [#612](https://github.com/open-telemetry/opentelemetry-js/issues/612)
- [@opentelemetry/plugin-express][otel-plugin-express] - By default, this plugin is not loaded

### Web Plugins

- [@opentelemetry/plugin-document-load][otel-plugin-document-load]
- [@opentelemetry/plugin-xml-http-request][otel-plugin-xml-http-request]
- [@opentelemetry/plugin-user-interaction][otel-plugin-user-interaction]

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
