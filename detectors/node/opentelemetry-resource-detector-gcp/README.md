# OpenTelemetry Resource Detector for GCP

Resource detector for Google Cloud Platform.

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

* [GCP Metadata Documentation][]

[`gcp-metadata`]: https://www.npmjs.com/package/gcp-metadata
[GCP Metadata Documentation]: https://cloud.google.com/compute/docs/metadata/overview
