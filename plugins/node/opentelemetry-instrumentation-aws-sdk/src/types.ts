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
  requestId: string;
}

export interface AwsSdkRequestHookInformation {
  moduleVersion?: string;
  request: NormalizedRequest;
}
export interface AwsSdkRequestCustomAttributeFunction {
  (span: Span, requestInfo: AwsSdkRequestHookInformation): void;
}

export interface AwsSdkResponseHookInformation {
  moduleVersion?: string;
  response: NormalizedResponse;
}
/**
 * span can be used to add custom attributes, or for any other need.
 * response is the object that is returned to the user calling the aws-sdk operation.
 * The response type and attributes on the response are client-specific.
 */
export interface AwsSdkResponseCustomAttributeFunction {
  (span: Span, responseInfo: AwsSdkResponseHookInformation): void;
}

export interface AwsSdkSqsProcessHookInformation {
  message: AWS.SQS.Message;
}
export interface AwsSdkSqsProcessCustomAttributeFunction {
  (span: Span, sqsProcessInfo: AwsSdkSqsProcessHookInformation): void;
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
   * In some cases the context propagation headers may be found in the message payload
   * rather than the message attribute.
   * When this field is turned on the instrumentation will parse the payload and extract the
   * context from there.
   * Even if the field is on and MessageAttribute contains context propagation field are present,
   * the MessageAttribute will get priority.
   * By default it is off.
   */
  sqsExtractContextPropagationFromPayload?: boolean;
}
