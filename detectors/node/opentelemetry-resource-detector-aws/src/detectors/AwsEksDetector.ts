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

import {
  Detector,
  IResource,
  ResourceDetectionConfig,
} from '@opentelemetry/resources';

import { awsEksDetectorSync } from './AwsEksDetectorSync';

/**
 * The AwsEksDetector can be used to detect if a process is running in AWS Elastic
 * Kubernetes and return a {@link Resource} populated with data about the Kubernetes
 * plugins of AWS X-Ray. Returns an empty Resource if detection fails.
 *
 * See https://docs.amazonaws.cn/en_us/xray/latest/devguide/xray-guide.pdf
 * for more details about detecting information for Elastic Kubernetes plugins
 *
 * @deprecated Use the new {@link AwsEksDetectorSync} class instead.
 */
export class AwsEksDetector implements Detector {
  // NOTE: these readonly props are kept for testing purposes
  readonly K8S_SVC_URL = 'kubernetes.default.svc';
  readonly AUTH_CONFIGMAP_PATH =
    '/api/v1/namespaces/kube-system/configmaps/aws-auth';
  readonly CW_CONFIGMAP_PATH =
    '/api/v1/namespaces/amazon-cloudwatch/configmaps/cluster-info';
  readonly TIMEOUT_MS = 2000;

  detect(_config?: ResourceDetectionConfig): Promise<IResource> {
    return Promise.resolve(awsEksDetectorSync.detect());
  }
}

export const awsEksDetector = new AwsEksDetector();
