#OpenTelemetry Runtime Metrics for Node.js
[![Gitter chat][gitter-image]][gitter-url]
[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-url]

This module provides automatic collection of Runtime Metrics which includes metrics for:
* Memory - more metrics
* Heap
* Heap Space
* Event Loop
* GC
* Process uptime


## Installation

```bash
npm install --save @opentelemetry/runtime-metrics
```

## Usage

```javascript

const { RuntimeMetrics } = require('@opentelemetry/runtime-metrics');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { MeterProvider } = require('@opentelemetry/metrics');

const exporter = new PrometheusExporter(
  { startServer: true },() => {
    console.log('prometheus scrape endpoint: http://localhost:9464/metrics');
  }
);

const meterProvider = new MeterProvider({
  exporter,
  interval: 2000,
});

const runtimeMetrics = new RuntimeMetrics({ meterProvider, name: 'example-runtime-metrics' });
runtimeMetrics.start();

```

### Install native stats for active platform
```shell script
npm run build:install
```

### Install native stats for custom platform arch and version
```shell script
#for example
npm run build:install platform=darwin arch=x64 version=10
npm run build:install platform=win32 arch=x64 version=10
```

### Build native stats for all platforms (osx, linux, windows) - this is needed only when native stats has changed. You should not need that.
```shell script
npm run build:all
```

### Get prebuilds from CircleCi.
1. For this you will need to obtain your [personal CircleCi token][circleci-token].
Once you have it add to process.env properties
```
CIRCLE_TOKEN=<YOUR TOKEN>
```
2. Make sure you are on master branch and then run the command

```shell script
npm run get:prebuilds
```

It should download the latest successful build of native stats from CircleCi - they are also included already in folder artifacts,
but you might want to get the latest version in case of ay changes

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us on [gitter][gitter-url]

## License

APACHE 2.0 - See [LICENSE][license-url] for more information.

[gitter-image]: https://badges.gitter.im/open-telemetry/opentelemetry-js-contrib.svg
[gitter-url]: https://gitter.im/open-telemetry/opentelemetry-node?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/master/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib.svg?path=packages%2Fopentelemetry-runtime-metrics
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-runtime-metrics
[devDependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib.svg?path=packages%2Fopentelemetry-runtime-metrics&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-runtime-metrics&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/runtime-metrics
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fruntime-metrics.svg
[circleci-token]: https://circleci.com/docs/2.0/managing-api-tokens/#creating-a-personal-api-token
