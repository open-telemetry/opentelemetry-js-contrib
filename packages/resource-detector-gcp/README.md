# OpenTelemetry Resource Detector for GCP

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

Resource detector for Google Cloud Platform.

Compatible with OpenTelemetry JS API `1.0+` and SDK `2.0+`.

## Installation


```bash
npm install --save @opentelemetry/resource-detector-gcp
```

## Usage

```typescript
import { detectResources } from '@opentelemetry/resources';
import { gcpDetector } from '@opentelemetry/resource-detector-gcp'
const resource = await detectResources({
   detectors: [gcpDetector],
})

const tracerProvider = new NodeTracerProvider({ resource });
```

## Available detectors

This package implements Semantic Convention [Version 1.39.0](https://github.com/open-telemetry/semantic-conventions/blob/v1.39.0/docs/README.md)

### GCP Detector

| Resource Attribute      | Description                                                           |
|-------------------------|-----------------------------------------------------------------------|
| cloud.account.id        | Value of `project-id` from GCP Metadata project.                      |
| cloud.availability_zone | Value of `zone` from GCP Metadata instance (parsed from full path).   |
| cloud.platform          | The GCP platform where the application is running.                    |
| cloud.provider          | The cloud provider. In this context, it's always `gcp`                |
| cloud.region            | Value of `region` from GCP Metadata instance (parsed from full path). |
| faas.instance           | Value of `id` from GCP Metadata instance.                             |
| faas.name               | Value of Environment Variable `K_SERVICE`.                            |
| faas.version            | Value of Environment Variable `K_REVISION`.                           |
| host.id                 | Value of `id` from GCP Metadata instance.                             |
| host.name               | Value of `name` from GCP Metadata instance.                           |
| host.type               | Value of `machine-type` from GCP Metadata instance.                   |
| k8s.cluster.name        | Value of `attributes/cluster-name` from GCP Metadata instance.        |

## Useful links

- [GCP Metadata Documentation][]
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[GCP Metadata Documentation]: https://cloud.google.com/compute/docs/metadata/overview
[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/resource-detector-gcp
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fresource-detector-gcp.svg
