import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type * as AWS from 'aws-sdk';

/**
 * These are normalized request and response, which are used by both sdk v2 and v3.
 * They organize the relevant data in one interface which can be processed in a
 * uniform manner in hooks
 */
export interface NormalizedRequest {
    serviceName: string;
    commandName: string;
    commandInput: Record<string, any>;
    region?: string;
}
export interface NormalizedResponse {
    data: any;
    request: NormalizedRequest;
}

export interface AwsSdkRequestCustomAttributeFunction {
    (span: Span, request: NormalizedRequest): void;
}

/**
 * span can be used to add custom attributes, or for any other need.
 * response is the object that is returned to the user calling the aws-sdk operation.
 * The response type and attributes on the response are client-specific.
 */
export interface AwsSdkResponseCustomAttributeFunction {
    (span: Span, response: NormalizedResponse): void;
}

export interface AwsSdkSqsProcessCustomAttributeFunction {
    (span: Span, message: AWS.SQS.Message): void;
}

export interface AwsSdkInstrumentationConfig extends InstrumentationConfig {
    /** hook for adding custom attributes before request is sent to aws */
    preRequestHook?: AwsSdkRequestCustomAttributeFunction;

    /** hook for adding custom attributes when response is received from aws */
    responseHook?: AwsSdkResponseCustomAttributeFunction;

    /** hook for adding custom attribute when an sqs process span is started */
    sqsProcessHook?: AwsSdkSqsProcessCustomAttributeFunction;

    /**
     * Most aws operation use http request under the hood.
     * if http instrumentation is enabled, each aws operation will also create
     * an http/s child describing the communication with amazon servers.
     * Setting the `suppressInternalInstrumentation` config value to `true` will
     * cause the instrumentation to suppress instrumentation of underlying operations,
     * effectively causing those http spans to be non-recordable.
     */
    suppressInternalInstrumentation?: boolean;

    /**
     * If passed, a span attribute will be added to all spans with key of the provided "moduleVersionAttributeName"
     * and value of the module version.
     */
    moduleVersionAttributeName?: string;
}
