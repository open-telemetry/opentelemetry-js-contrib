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
import { Tracer, Span } from '@opentelemetry/api';
import { ServiceExtension, RequestMetadata } from './ServiceExtension';
import { SqsServiceExtension } from './sqs';
import {
  AwsSdkInstrumentationConfig,
  NormalizedRequest,
  NormalizedResponse,
} from '../types';
import { DynamodbServiceExtension } from './dynamodb';
import { SnsServiceExtension } from './sns';
import { LambdaServiceExtension } from './lambda';
import { EventBridgeServiceExtension } from './eventbridge';

export class ServicesExtensions implements ServiceExtension {
  services: Map<string, ServiceExtension> = new Map();

  constructor() {
    this.services.set('SQS', new SqsServiceExtension());
    this.services.set('SNS', new SnsServiceExtension());
    this.services.set('EventBridge', new EventBridgeServiceExtension());
    this.services.set('DynamoDB', new DynamodbServiceExtension());
    this.services.set('Lambda', new LambdaServiceExtension());
  }

  requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    const serviceExtension = this.services.get(request.serviceName);
    if (!serviceExtension)
      return {
        isIncoming: false,
      };
    return serviceExtension.requestPreSpanHook(request);
  }

  requestPostSpanHook(request: NormalizedRequest) {
    const serviceExtension = this.services.get(request.serviceName);
    if (!serviceExtension?.requestPostSpanHook) return;
    return serviceExtension.requestPostSpanHook(request);
  }

  responseHook(
    response: NormalizedResponse,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig
  ) {
    const serviceExtension = this.services.get(response.request.serviceName);
    serviceExtension?.responseHook?.(response, span, tracer, config);
  }
}
