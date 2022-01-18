# OpenTelemetry Resource Detector for GCP

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

Resource detector for Google Cloud Platform.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

The GCP resource detector requires Node.JS 10+ due to a dependency on [`gcp-metadata`][] which uses features only available in Node.JS 10+.

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

## Useful links

- [GCP Metadata Documentation][]
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[`gcp-metadata`]: https://www.npmjs.com/package/gcp-metadata
[GCP Metadata Documentation]: https://cloud.google.com/compute/docs/metadata/overview
[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=detectors%2Fnode%2Fopentelemetry-resource-detector-gcp
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=detectors%2Fnode%2Fopentelemetry-resource-detector-gcp
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=detectors%2Fnode%2Fopentelemetry-resource-detector-gcp&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=detectors%2Fnode%2Fopentelemetry-resource-detector-gcp&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/resource-detector-gcp
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fresource-detector-gcp.svg
