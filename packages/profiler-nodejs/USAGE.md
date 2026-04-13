# Node.js Profiler Module

`@opentelemetry/profiler-nodejs` is a practical profiling bridge for Node.js.
It collects profiles with `@datadog/pprof`, maps OpenTelemetry resource data to
profiling tags, and uploads profiles to a backend such as DataKit.

This package is not an implementation of the OpenTelemetry Profiles signal. It
is a compatibility-focused module for real profile delivery.

## What It Exports

The current exporter emits two `pprof` files:

- `wall.pprof`
- `space.pprof`

This layout is intentional. Guance's current Node.js parser expects the legacy
`ddtrace` layout rather than a single `auto.pprof` file.

The sample types are:

- `wall.pprof`: `sample/count`, optional `cpu/nanoseconds`, `wall/nanoseconds`
- `space.pprof`: `objects/count`, `space/bytes`

## Basic Usage

```ts
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import {
  DatakitProfilingExporter,
  NodeProfiling,
} from '@opentelemetry/profiler-nodejs';

const profiler = new NodeProfiling({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'orders-api',
    [ATTR_SERVICE_VERSION]: '1.2.3',
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: 'prod',
  }),
  exporter: new DatakitProfilingExporter(),
});

await profiler.start();
```

## Exporter Options

### `DatakitProfilingExporter`

```ts
new DatakitProfilingExporter({
  endpoint: 'http://127.0.0.1:9529/profiling/v1/input',
  timeoutMillis: 30000,
  headers: {},
  fetch: globalThis.fetch,
});
```

Parameters:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `endpoint` | `string` | `http://127.0.0.1:9529/profiling/v1/input` | Profile upload endpoint. |
| `timeoutMillis` | `number` | `30000` | HTTP timeout for one upload request. |
| `headers` | `Record<string, string>` | `{}` | Extra request headers. |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Custom fetch implementation. |

## Profiler Options

### `NodeProfiling`

```ts
new NodeProfiling({
  exporter,
  resource,
  tags,
  serviceName,
  serviceVersion,
  deploymentEnvironment,
  hostName,
  profileTypes,
  intervalMillis,
  wallDurationMillis,
  heapSamplingIntervalBytes,
  cpuProfilingEnabled,
});
```

Parameters:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `exporter` | `ProfileExporter` | required | Exporter used to send collected profiles. |
| `resource` | `Resource` | unset | OpenTelemetry resource used to derive tags such as service name and version. |
| `tags` | `Record<string, string \| number \| boolean>` | unset | Extra profiling tags appended to the exported event. |
| `serviceName` | `string` | derived from `resource` | Overrides the service name tag. |
| `serviceVersion` | `string` | derived from `resource` | Overrides the service version tag. |
| `deploymentEnvironment` | `string` | derived from `resource` | Overrides the environment tag. |
| `hostName` | `string` | derived from OS hostname | Overrides the host tag. |
| `profileTypes` | `('wall' \| 'heap')[]` | `['wall', 'heap']` | Profile types collected on each cycle. |
| `intervalMillis` | `number` | `60000` | Interval between collection cycles. |
| `wallDurationMillis` | `number` | `10000` | Duration of one wall profile capture. |
| `heapSamplingIntervalBytes` | `number` | `524288` | Heap sampling interval passed to `@datadog/pprof`. |
| `cpuProfilingEnabled` | `boolean` | `true` | Enables CPU time data inside `wall.pprof`. |
| `collectCpuTime` | `boolean` | deprecated | Deprecated alias of `cpuProfilingEnabled`. |

## Default Behavior

By default, the profiler:

- collects both `wall` and `heap` profiles
- runs one collection cycle every 60 seconds
- records a 10 second wall profile
- enables CPU time inside the wall profile
- uploads to `http://127.0.0.1:9529/profiling/v1/input`

## Lifecycle

- `await profiler.start()`: starts the periodic collection loop
- `await profiler.collectOnce()`: collects and exports one batch immediately
- `await profiler.shutdown()`: stops the loop, flushes any in-flight work, and shuts down the exporter

## Notes

- Heap profiling is started lazily and reused between collection cycles.
- If `profileTypes` is empty, the module skips export.
- The exporter sends multipart form data with `wall`, `space`, and `event`.
- The event payload uses `profiler: "ddtrace"` for parser compatibility.
