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


import { ISamplingRule } from "./remote-sampler.types";
import { wildcardMatch, attributeMatch } from "./utils";
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { Attributes, AttributeValue } from '@opentelemetry/api'; 
import { SemanticAttributes, SemanticResourceAttributes} from '@opentelemetry/semantic-conventions';
import { Resource } from '@opentelemetry/resources';
import { Reservoir } from "./reservoir";
import { Statistics } from "./statistics";


export class SamplingRule implements ISamplingRule {
    public RuleName: string;
    public Priority: number;
    public ReservoirSize: number;
    public FixedRate: number;
    public ServiceName: string; 
    public ServiceType: string;
    public Host: string;
    public HTTPMethod: string;
    public URLPath: string;
    public ResourceARN: string; 
    public Attributes?: {[key: string]: string};
    public Version: number;
    public reservoir: Reservoir;
    public statistics: Statistics

    constructor(ruleName: string, priority: number, reservoirSize: number, fixedRate: number, serviceName: string, 
        serviceType: string, host: string, httpMethod: string, urlPath: string, resourceARN: string, version: number,
        attributes?: any){
        this.RuleName = ruleName; 
        this.Priority = priority; 
        this.ReservoirSize = reservoirSize; 
        this.FixedRate = fixedRate; 
        this.ServiceName = serviceName; 
        this.ServiceType = serviceType; 
        this.Host = host; 
        this.HTTPMethod = httpMethod; 
        this.URLPath = urlPath; 
        this.ResourceARN = resourceARN; 
        this.Version = version;
        this.Attributes = attributes;

        this.reservoir = new Reservoir(this.ReservoirSize);
        this.statistics = new Statistics();
    }

    public matches = (attributes: Attributes, resource: Resource): boolean => {
        const host: AttributeValue | undefined = attributes[SemanticAttributes.HTTP_HOST];
        const httpMethod = attributes[SemanticAttributes.HTTP_METHOD]
        const serviceName = attributes[SemanticResourceAttributes.SERVICE_NAME];
        const urlPath = attributes[SemanticAttributes.HTTP_URL];
        const serviceType = resource.attributes[SemanticResourceAttributes.CLOUD_PLATFORM];
    
        // "Default" is a reserved keyword from X-Ray back-end.
        if(this.RuleName === 'Default'){
            return true;
        }
    
        return attributeMatch(attributes, this.Attributes)
        && (!host || wildcardMatch(this.Host, host))
        && (!httpMethod || wildcardMatch(this.HTTPMethod, httpMethod))
        && (!serviceName || wildcardMatch(this.ServiceName, serviceName))
        && (!urlPath || wildcardMatch(this.URLPath, urlPath))
        && (!serviceType || wildcardMatch(this.ServiceType, serviceType));
    }

    public sample = (attributes: Attributes): SamplingDecision => {
        // Returning a drop sample decision 
        // TODO: use reservoir in next PR to make this decision 
        return SamplingDecision.NOT_RECORD;

    }  

}