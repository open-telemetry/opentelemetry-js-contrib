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

import { ISamplingRule } from './types';
import { wildcardMatch, attributeMatch } from './utils';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { Attributes, AttributeValue } from '@opentelemetry/api';
import {
  SemanticAttributes,
  SemanticResourceAttributes,
} from '@opentelemetry/semantic-conventions';
import { Resource } from '@opentelemetry/resources';
import { Reservoir } from './reservoir';
import { Statistics } from './statistics';

export class SamplingRule implements ISamplingRule {
  public samplingRule: any;
  public reservoir: Reservoir;
  public statistics: Statistics;

  constructor(samplingRule: any) {
    this.samplingRule = samplingRule;

    this.reservoir = new Reservoir(this.samplingRule.reservoirSize);
    this.statistics = new Statistics();
  }

  public matches = (attributes: Attributes, resource: Resource): boolean => {
    const host: AttributeValue | undefined =
      attributes[SemanticAttributes.HTTP_HOST];
    const httpMethod = attributes[SemanticAttributes.HTTP_METHOD];
    const serviceName = attributes[SemanticResourceAttributes.SERVICE_NAME];
    const urlPath = attributes[SemanticAttributes.HTTP_URL];
    const serviceType =
      resource.attributes[SemanticResourceAttributes.CLOUD_PLATFORM];
    const resourceARN =
      resource.attributes[SemanticResourceAttributes.AWS_ECS_CLUSTER_ARN] ||
      resource.attributes[SemanticResourceAttributes.AWS_EKS_CLUSTER_ARN] ||
      resource.attributes[SemanticResourceAttributes.FAAS_ID];

    // "Default" is a reserved keyword from X-Ray back-end.
    if (this.samplingRule.ruleName === 'Default') {
      return true;
    }

    return (
      attributeMatch(attributes, this.samplingRule.attributes) &&
      (!host || wildcardMatch(this.samplingRule.host, host)) &&
      (!httpMethod ||
        wildcardMatch(this.samplingRule.httpMethod, httpMethod)) &&
      (!serviceName ||
        wildcardMatch(this.samplingRule.sericeName, serviceName)) &&
      (!urlPath || wildcardMatch(this.samplingRule.urlPath, urlPath)) &&
      (!serviceType ||
        wildcardMatch(this.samplingRule.serviceType, serviceType)) &&
      (!serviceType ||
        wildcardMatch(this.samplingRule.resourceARN, resourceARN))
    );
  };

  public sample = (attributes: Attributes): SamplingDecision => {
    // Returning a drop sample decision
    // TODO: use reservoir in next PR to make this decision
    return SamplingDecision.NOT_RECORD;
  };
}
