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

## Available detectors & Semantic Conventions

This package uses `@opentelemetry/semantic-conventions` version `1.22+`, which implements Semantic Convention [Version 1.7.0](https://github.com/open-telemetry/opentelemetry-specification/blob/v1.7.0/semantic_conventions/README.md)

### Alibaba Cloud Ecs Detector

Populates `cloud` and `host` for processes running on [Alibaba Cloud ECS](https://www.alibabacloud.com/product/ecs). More info about Alibaba Instance Identities can be found [here](https://www.alibabacloud.com/help/en/ecs/user-guide/use-instance-identities).

| Resource Attribute      |  Description                                                    | Notes                                      |
|-------------------------|-----------------------------------------------------------------| ------------------------------------------ |
| cloud.account.id        | Value of `owner-account-id` on Alibaba Cloud                    | Key: `SEMRESATTRS_CLOUD_ACCOUNT_ID`        |
| cloud.availability_zone | Value of `zone-id` on Alibaba Cloud                             | Key: `SEMRESATTRS_CLOUD_AVAILABILITY_ZONE` |
| cloud.platform          | In this context, it's always `alibaba_cloud_ecs`                | Key: `SEMRESATTRS_CLOUD_PLATFORM`          |
| cloud.provider          | In this context, it's always `alibaba_cloud`                    | Key: `SEMRESATTRS_CLOUD_PROVIDER`          |
| cloud.region            | Value of `region-id` on Alibaba Cloud                           | Key: `SEMRESATTRS_CLOUD_REGION`            |
| host.id                 | Value of `instance-id` on Alibaba Cloud                         | Key: `SEMRESATTRS_HOST_ID`                 |
| host.name               | The hostname for the app, retrieve from the `hostname` endpoint | Key: `SEMRESATTRS_HOST_TYPE`               |
| host.type               | Value of `instance-type` on Alibaba Cloud                       | Key: `SEMRESATTRS_HOST_NAME`               |

[resource-semantic_conventions]: https://github.com/open-telemetry/opentelemetry-specification/tree/master/specification/resource/semantic_conventions
