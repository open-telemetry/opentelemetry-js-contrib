# OpenTelemetry Resource Detector for Docker

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

[component owners](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/.github/component_owners.yml): @abhee11

Resource detector for docker.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/resource-detector-docker
```

## Usage

```typescript
import { detectResources } from '@opentelemetry/resources';
import { dockerCGroupV1Detector } from '@opentelemetry/resource-detector-docker'
const resource = await detectResources({
   detectors: [dockerCGroupV1Detector],
})

const tracerProvider = new NodeTracerProvider({ resource });
```

## Available detectors

- `dockerCGroupV1Detector`: Populates `container.id` for processes running on docker cgroup v1

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
