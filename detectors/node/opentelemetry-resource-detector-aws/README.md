# OpenTelemetry Resource Detector for AWS

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

[component owners](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/.github/component_owners.yml): @willarmiros @NathanielRN

Resource detector for Amazon Web Services.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/resource-detector-aws
```

## Usage

```typescript
import { detectResources } from '@opentelemetry/resources';
import { awsEc2Detector } from '@opentelemetry/resource-detector-aws'
const resource = await detectResources({
   detectors: [awsEc2Detector],
})

const tracerProvider = new NodeTracerProvider({ resource });
```

## Available detectors

- `awsBeanstalkDetector`: Populates `service` for processes running on [AWS Elastic Beanstalk](https://aws.amazon.com/elasticbeanstalk/)
- `awsEc2Detector`: Populates `cloud` and `host` for processes running on [Amazon EC2](https://aws.amazon.com/ec2/), including abstractions such as ECS on EC2. Notably, it does not populate anything on AWS Fargate
- `awsEcsDetector`: Populates `container` for containers running on [Amazon ECS](https://aws.amazon.com/ecs/)
- `awsEksDetector`: Populates `container` and `k8s.cluster_name` for containers running on [Amazon EKS](https://aws.amazon.com/eks/)
  - `k8s.cluster_name` is not always available depending on the configuration of CloudWatch monitoring for the EKS cluster
- `awsLambdaDetector`: Populates `faas` and `cloud` for functions running on [AWS Lambda](https://aws.amazon.com/lambda/)
  - `faas.id` is currently not populated as it is not provided by the runtime at startup

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/resource-detector-aws
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fresource-detector-aws.svg
