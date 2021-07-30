# OpenTelemetry Resource Detector for AWS

Resource detector for Amazon Web Services.

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

- `awsBeanstalkDetector`: Populates `service` for processes running on [AWS Elastic Beanstalk](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/Welcome.html)
- `awsEc2Detector`: Populates `cloud` and `host` for processes running on [Amazon EC2](https://aws.amazon.com/ec2/), including abstractions such as ECS on EC2. Notably, it does not populate anything on AWS Fargate
- `awsEcsDetector`: Populates `container` for containers running on [Amazon ECS](https://aws.amazon.com/ecs/)
- `awsEksDetector`: Populates `container` and `k8s.cluster_name` for containers running on [Amazon EKS](https://aws.amazon.com/eks/)
  - `k8s.cluster_name` is not always available depending on the configuration of CloudWatch monitoring for the EKS cluster
- `awsLambdaDetector`: Populates `faas` and `cloud` for functions running on [AWS Lambda](https://aws.amazon.com/lambda/)
  - `faas.id` is currently not populated as it is not provided by the runtime at startup
