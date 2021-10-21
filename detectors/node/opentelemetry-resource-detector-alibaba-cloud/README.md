# OpenTelemetry Resource Detector for Alibaba Cloud

Resource detector for Alibaba Cloud.

The OpenTelemetry Resource is an immutable representation of the entity producing telemetry. For example, a process producing telemetry that is running in a container on Kubernetes has a Pod name, it is in a namespace and possibly is part of a Deployment which also has a name. All three of these attributes can be included in the `Resource`.

[This document][resource-semantic_conventions] defines standard attributes for resources.

Supports OpenTelemetry JS SDK 1.0

## Installation

```bash
npm install --save @opentelemetry/resource-detector-alibaba-cloud
```

## Usage

```typescript
import { detectResources } from '@opentelemetry/resources';
import { alibabaCloudEcsDetector } from '@opentelemetry/resource-detector-alibaba-cloud'
const resource = await detectResources({
   detectors: [alibabaCloudEcsDetector],
})

const tracerProvider = new NodeTracerProvider({ resource });
```

## Available detectors

- `alibabaCloudEcsDetector`: Populates `cloud` and `host` for processes running on [Alibaba Cloud ECS](https://www.alibabacloud.com/product/ecs).

[resource-semantic_conventions]: https://github.com/open-telemetry/opentelemetry-specification/tree/master/specification/resource/semantic_conventions
