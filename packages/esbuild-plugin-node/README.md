# OpenTelemetry Esbuild for Node

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-url]

## About

This module provides a way to auto instrument any Node application to capture telemetry from a number of popular libraries and frameworks, via an [esbuild](https://esbuild.github.io/) plugin.
You can export the telemetry data in a variety of formats. Exporters, samplers, and more can be configured via [environment variables][env-var-url].
The net result is the ability to gather telemetry data from a Node application without any code changes.

This module also provides a simple way to manually initialize multiple Node instrumentations for use with the OpenTelemetry SDK.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/esbuild-plugin-node
```

## Usage: Esbuild plugin

This module includes instrumentation for all supported instrumentations and [all available data exporters][exporter-url].
It provides a completely automatic, out-of-the-box experience.
Please see the [Supported Instrumentations](#supported-instrumentations) section for more information.

Enable auto instrumentation by configuring it in your esbuild script:

```javascript
const { openTelemetryPlugin } = require('@opentelemetry/esbuild-plugin-node');
const { build } = require('esbuild');

build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  outfile: 'dist/server.js',
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  plugins: [openTelemetryPlugin()],
});
```

## Usage: Instrumentation Initialization

OpenTelemetry Meta Packages for Node automatically loads instrumentations for Node builtin modules and common packages.

Enable auto instrumentation by configuring it in your esbuild script:

```javascript
const { openTelemetryPlugin } = require('@opentelemetry/esbuild-plugin-node');
const { build } = require('esbuild');

build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  outfile: 'dist/server.js',
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  plugins: [openTelemetryPlugin()],
});
```

Custom configuration for each of the instrumentations can be passed to the plugin, by providing an object with the name of the instrumentation as a key, and its configuration as the value.

```javascript
const { openTelemetryPlugin } = require('@opentelemetry/esbuild-plugin-node');
const { build } = require('esbuild');

build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  outfile: 'dist/server.js',
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  plugins: [
    openTelemetryPlugin({
      instrumentationConfig: {
        '@opentelemetry/instrumentation-aws-sdk': {
          suppressInternalInstrumentation: true,
        },
      },
    }),
  ],
});
```

This esbuild script will instrument non-builtin packages but will not configure the rest of the OpenTelemetry SDK to export traces
from your application. To do that you must also configure the SDK.

The esbuild script currently only patches non-builtin modules (more specifically, modules in [opentelemetry-js-contrib](https://github.com/open-telemetry/opentelemetry-js-contrib)), so this is also the place to configure the instrumentation
for builtins or add any additional instrumentations.

### Gotchas

There are limitations to the configuration options for each package. Most notably, any functions (like `ignoreIncomingRequestHook` in the example) are not allowed to be passed in to plugins.

The reason for this is that the current mechanism of instrumenting packages involves stringifying the instrumentation configs, which does not account for any external scoped dependencies, and thus creates subtle opportunities for bugs.

```javascript
const {
  getNodeAutoInstrumentations,
} = require('@opentelemetry/auto-instrumentations-node');
const {
  AsyncHooksContextManager,
} = require('@opentelemetry/context-async-hooks');
const {
  OTLPTraceExporter,
} = require('@opentelemetry/exporter-trace-otlp-http');
const { NodeSDK } = require('@opentelemetry/sdk-node');

const instrumentations = getNodeAutoInstrumentations();

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  contextManager: new AsyncHooksContextManager().enable(),
  instrumentations,
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});
```

## Supported instrumentations

See [@opentelemetry/auto-instrumentations-node](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/metapackages/auto-instrumentations-node) for the supported packages.

Note that Node.js builtin modules will not be patched by this plugin.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For more about Esbuild plugins: <https://esbuild.github.io/plugins/>

## License

APACHE 2.0 - See [LICENSE][license-url] for more information.

[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fauto-instrumentations-node.svg
[env-var-url]: https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/configuration/sdk-environment-variables.md#general-sdk-configuration
[exporter-url]: https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/configuration/sdk-environment-variables.md#otlp-exporter
[require-url]: https://nodejs.org/api/cli.html#-r---require-module
