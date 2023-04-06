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

import * as assert from 'assert';
import { SamplingRule } from "../src/sampling-rule";
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

describe('SamplingRule', () => {
    const samplingRule = new SamplingRule("testRule", 1, 1, 0.05, "myServiceName", "AWS::EC2::Instance", 
            "localhost", "GET", "/hello", "*", 1, {})


    it('should match with all specified attributes', () => {
    
        let attributes = {"http.host": "localhost", "http.method": "GET", "http.url": "http://127.0.0.1:5000/hello"}
        const resource = new Resource({[SemanticResourceAttributes.SERVICE_NAME]: "aws_ec2"})

        assert.equal(samplingRule.matches(attributes, resource), true)

    });

    it('should match with wildcard attributes', () => {
        const samplingRule = new SamplingRule("testRule", 1, 1, 0.05, "myServiceName", "*", 
        "*", "*", "/hello", "*", 1, {})
    
        let attributes = {"http.host": "localhost", "http.method": "GET", "http.url": "http://127.0.0.1:5000/hello"}
        const resource = new Resource({[SemanticResourceAttributes.SERVICE_NAME]: "aws_ec2"})

        assert.equal(samplingRule.matches(attributes, resource), true)

    });

    it('should match with no attributes specified', () => {
        const samplingRule = new SamplingRule("testRule", 1, 1, 0.05, "myServiceName", "*", 
        "*", "*", "/hello", "*", 1, {})
    
        const resource = new Resource({[SemanticResourceAttributes.SERVICE_NAME]: "aws_ec2"})

        assert.equal(samplingRule.matches({}, resource), true)

    });

    it('should match with HTTP target', () => {
        const samplingRule = new SamplingRule("testRule", 1, 1, 0.05, "myServiceName", "*", 
        "*", "*", "/hello", "*", 1, {})

        let attributes = {"http.target": "/hello"}

        const resource = new Resource({[SemanticResourceAttributes.SERVICE_NAME]: ""})

        assert.equal(samplingRule.matches(attributes, resource), true)

    });

});
