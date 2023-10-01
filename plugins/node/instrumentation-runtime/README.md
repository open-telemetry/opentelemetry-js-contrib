# OpenTelemetry runtime Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for some of the [`perf_hooks`](https://nodejs.org/api/perf_hooks.html) performance measurement.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-runtime
```

## Usage

```js
const { MeterProvider } = require('@opentelemetry/sdk-metrics');
const { HostMetrics } = require('@opentelemetry/host-metrics');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const {
  RuntimeInstrumentation,
} = require('@opentelemetry/instrumentation-runtime');

const exporter = new PrometheusExporter(
  {
    startServer: true,
  },
  () => {
    console.log('prometheus scrape endpoint: http://localhost:9464/metrics');
  }
);

const meterProvider = new MeterProvider();
meterProvider.addMetricReader(exporter);

registerInstrumentations({
  instrumentations: [
    new RuntimeInstrumentation({
      // see under for available configuration
    }),
  ],
});
```

### Runtime Instrumentation Options

Runtime instrumentation has currently one option. You can set the following:

| Options                           | Type               | Description                                                                                                                                                           |
| --------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `monitorEventLoopDelayResolution` | `number`           | Sampling rate for data collection, in milliseconds. [perf_hooks.monitorEventLoopDelay](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions) |
| `customMetricAttributes`          | `() => Attributes` | Function for adding custom metric attributes on all recorded metrics                                                                                                  |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-runtime
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-runtime.svg
