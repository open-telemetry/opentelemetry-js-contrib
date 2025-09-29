# OpenTelemetry Host Metrics for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-url]

This module provides automatic collection of Host Metrics which includes metrics for:

- CPU
- Memory
- Network

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/host-metrics
```

## Usage

```javascript
const { MeterProvider } = require('@opentelemetry/sdk-metrics');
const { HostMetrics } = require('@opentelemetry/host-metrics');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');

const exporter = new PrometheusExporter(
  {
    startServer: true
  }, () => {
    console.log('prometheus scrape endpoint: http://localhost:9464/metrics')
  }
);

const meterProvider = new MeterProvider({
  readers: [reader],
});

const hostMetrics = new HostMetrics({ meterProvider });
hostMetrics.start();
```

## Semantic Conventions

This package uses Semantic Conventions [Version 1.25.0](https://github.com/open-telemetry/semantic-conventions/tree/v1.25.0/docs/system).
As for now the Semantic Conventions are bundled in this package but eventually will be imported from `@opentelemetry/semantic-conventions` package when it is updated to latest version.
Ref: [opentelemetry-js/issues/4235](https://github.com/open-telemetry/opentelemetry-js/issues/4235)

Metrics collected:

| Metric                      | Short Description                                         |
| --------------------------- | --------------------------------------------------------- |
| `system.cpu.time`           | Seconds each logical CPU spent on each mode               |
| `system.cpu.utilization`    | CPU usage time (0-1)                                      |
| `system.memory.usage`       | Reports memory in use by state                            |
| `system.memory.utilization` | Memory usage (0-1)                                        |
| `system.network.dropped`    | Count of packets that are dropped                         |
| `system.network.errors`     | Count of network errors detected                          |
| `system.network.io`         | Network flow direction                                    |
| `process.cpu.time`          | Total CPU seconds                                         |
| `process.cpu.utilization`   | Difference in process.cpu.time since the last measurement |
| `process.memory.usage`      | The amount of physical memory in use                      |

Attributes collected:

| Metric                      | Short Description                  |
| --------------------------- | ---------------------------------- |
| `system.cpu.logical_number` | The logical CPU number             |
| `system.cpu.state`          | The state of the CPU               |
| `system.memory.state`       | The memory state                   |
| `system.device`             | The device identifier              |
| `network.io.direction`      | The network IO operation direction |
| `system.network.state`      | The network state                  |
| `process.cpu.state`         | The CPU state                      |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

APACHE 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/host-metrics
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fhost-metrics.svg
