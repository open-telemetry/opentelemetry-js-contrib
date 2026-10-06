# OpenTelemetry Host Metrics Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic collection of host metrics for the Node.js process and operating system, including CPU, memory, and network. It is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle (disabled by default; enable via `OTEL_NODE_ENABLED_INSTRUMENTATIONS`).

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-host-metrics
```

## Supported Versions

- Node.js `^18.19.0 || >=20.6.0`

## Usage

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { HostMetricsInstrumentation } = require('@opentelemetry/instrumentation-host-metrics');

const sdk = new NodeSDK({
  instrumentations: [new HostMetricsInstrumentation()],
});

sdk.start();
```

### Host Metrics Instrumentation Options

| Option         | Type       | Description                                                                                                                                                                                                                                                            |
|----------------|------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `metricGroups` | `string[]` | Optionally restrict collection to one or more metric groups (see [Semantic Conventions](#semantic-conventions)). When unset, all metrics are collected. For example, `metricGroups: ['process.cpu', 'process.memory']` limits collection to those metrics only. |

## Semantic Conventions

Metrics collected:

| Metric                          | Short Description                                         |
|---------------------------------|-----------------------------------------------------------|
| **Group `system.cpu`**          |                                                           |
| `system.cpu.time`               | Seconds each logical CPU spent on each mode               |
| `system.cpu.utilization`        | CPU usage (0-1)                                           |
| **Group `system.memory`**       |                                                           |
| `system.memory.usage`           | Reports memory in use by state                            |
| `system.memory.utilization`     | Memory usage (0-1)                                        |
| **Group `system.network`**      |                                                           |
| `system.network.packet.dropped` | Count of packets dropped                                  |
| `system.network.errors`         | Count of network errors detected                          |
| `system.network.io`             | Bytes transmitted and received                            |
| **Group `process.cpu`**         |                                                           |
| `process.cpu.time`              | Total CPU seconds                                         |
| `process.cpu.utilization`       | Difference in process.cpu.time since the last measurement |
| **Group `process.memory`**      |                                                           |
| `process.memory.usage`          | The amount of physical memory in use                      |

The "Group" names are the values accepted by the `metricGroups` configuration option.

Attributes collected:

| Attribute              | Short Description                  |
|------------------------|------------------------------------|
| `cpu.logical_number`   | The logical CPU number             |
| `cpu.mode`             | The mode of the CPU                |
| `system.memory.state`  | The memory state                   |
| `system.device`        | The device identifier              |
| `network.io.direction` | The network IO operation direction |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-host-metrics
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-host-metrics.svg
