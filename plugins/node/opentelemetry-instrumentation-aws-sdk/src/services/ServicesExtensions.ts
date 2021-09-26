import { Tracer, Span } from '@opentelemetry/api';
import { ServiceExtension, RequestMetadata } from './ServiceExtension';
import { SqsServiceExtension } from './sqs';
import { AwsSdkInstrumentationConfig, NormalizedRequest, NormalizedResponse } from '../types';
import { DynamodbServiceExtension } from './dynamodb';

export class ServicesExtensions implements ServiceExtension {
    services: Map<string, ServiceExtension> = new Map();

    constructor() {
        this.services.set('SQS', new SqsServiceExtension());
        this.services.set('DynamoDB', new DynamodbServiceExtension());
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

    responseHook(response: NormalizedResponse, span: Span, tracer: Tracer, config: AwsSdkInstrumentationConfig) {
        const serviceExtension = this.services.get(response.request.serviceName);
        serviceExtension?.responseHook?.(response, span, tracer, config);
    }
}
