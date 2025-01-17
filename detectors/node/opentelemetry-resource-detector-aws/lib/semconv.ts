/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Following OpenTelemetry semantic conventions best practices, we copy the incubating
 * semantic conventions into our codebase rather than importing them directly.
 * This prevents breaking changes in minor versions and reduces disk usage from multiple versions.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

// AWS attributes
export const ATTR_AWS_ECS_CLUSTER_ARN = 'aws.ecs.cluster.arn';
export const ATTR_AWS_ECS_CONTAINER_ARN = 'aws.ecs.container.arn';
export const ATTR_AWS_ECS_LAUNCHTYPE = 'aws.ecs.launchtype';
export const ATTR_AWS_ECS_TASK_ARN = 'aws.ecs.task.arn';
export const ATTR_AWS_ECS_TASK_FAMILY = 'aws.ecs.task.family';
export const ATTR_AWS_ECS_TASK_REVISION = 'aws.ecs.task.revision';
export const ATTR_AWS_LOG_GROUP_ARNS = 'aws.log.group.arns';
export const ATTR_AWS_LOG_GROUP_NAMES = 'aws.log.group.names';
export const ATTR_AWS_LOG_STREAM_ARNS = 'aws.log.stream.arns';
export const ATTR_AWS_LOG_STREAM_NAMES = 'aws.log.stream.names';

// Cloud attributes
export const ATTR_CLOUD_ACCOUNT_ID = 'cloud.account.id';
export const ATTR_CLOUD_AVAILABILITY_ZONE = 'cloud.availability.zone';
export const ATTR_CLOUD_PLATFORM = 'cloud.platform';
export const ATTR_CLOUD_PROVIDER = 'cloud.provider';
export const ATTR_CLOUD_REGION = 'cloud.region';

// Container attributes
export const ATTR_CONTAINER_ID = 'container.id';
export const ATTR_CONTAINER_NAME = 'container.name';

// FaaS attributes
export const ATTR_FAAS_NAME = 'faas.name';
export const ATTR_FAAS_VERSION = 'faas.version';

// Host attributes
export const ATTR_HOST_ID = 'host.id';
export const ATTR_HOST_NAME = 'host.name';
export const ATTR_HOST_TYPE = 'host.type';

// Kubernetes attributes
export const ATTR_K8S_CLUSTER_NAME = 'k8s.cluster.name';

// Service attributes
export const ATTR_SERVICE_INSTANCE_ID = 'service.instance.id';
export const ATTR_SERVICE_NAME = 'service.name';
export const ATTR_SERVICE_NAMESPACE = 'service.namespace';
export const ATTR_SERVICE_VERSION = 'service.version';

// Cloud provider/platform values
export const CLOUD_PROVIDER_VALUE_AWS = 'aws';
export const CLOUD_PLATFORM_VALUE_AWS_EC2 = 'aws_ec2';
export const CLOUD_PLATFORM_VALUE_AWS_ECS = 'aws_ecs';
export const CLOUD_PLATFORM_VALUE_AWS_EKS = 'aws_eks';
export const CLOUD_PLATFORM_VALUE_AWS_ELASTIC_BEANSTALK =
  'aws_elastic_beanstalk';
export const CLOUD_PLATFORM_VALUE_AWS_LAMBDA = 'aws_lambda';
