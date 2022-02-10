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
import { Span, SpanKind, Tracer } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import {
  AwsSdkInstrumentationConfig,
  NormalizedRequest,
  NormalizedResponse,
  RequestMetadata,
  ServiceExtension,
  SqsServiceExtension,
} from '../src';
import { TextMapSetter, context, propagation } from '@opentelemetry/api';
import type { ClientContext } from 'aws-lambda';

// Sample implementation of a custom service extension
export class LambdaTestCustomServiceExtension implements ServiceExtension {
  requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    const functionName = this.extractFunctionName(request.commandInput);

    const spanAttributes = {
      [SemanticAttributes.FAAS_INVOKED_NAME]: functionName,
      [SemanticAttributes.FAAS_INVOKED_PROVIDER]: 'aws',
    };
    let spanName: string | undefined;

    switch (request.commandName) {
      case 'Invoke':
        spanName = `${functionName} invoke`;
        break;
    }
    return {
      isIncoming: false,
      spanAttributes,
      spanKind: SpanKind.CLIENT,
      spanName,
    };
  }
  requestPostSpanHook = (request: NormalizedRequest) => {
    switch (request.commandName) {
      case 'Invoke':
        {
          request.commandInput = injectPropagationContext(request.commandInput);
        }
        break;
    }
  };
  responseHook(
    response: NormalizedResponse,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig
  ) {
    const operation = response.request.commandName;

    if (operation === 'Invoke') {
      console.log(response.data);
      if (response.data && '$metadata' in response.data) {
        span.setAttribute(
          SemanticAttributes.FAAS_EXECUTION,
          response.data['$metadata'].requestId
        );
      }
    }
  }

  extractFunctionName = (commandInput: Record<string, any>): string => {
    return commandInput?.FunctionName;
  };
}

class ContextSetter implements TextMapSetter<Record<string, any>> {
  set(carrier: Record<string, any>, key: string, value: string): void {
    const parsedClientContext: ClientContext = JSON.parse(
      carrier.ClientContext !== undefined
        ? Buffer.from(carrier.ClientContext, 'base64').toString('utf8')
        : '{"Custom":{}}'
    );
    const updatedPayload = {
      ...parsedClientContext,
      Custom: {
        ...parsedClientContext.Custom,
        [key]: value,
      },
    };
    const encodedPayload = Buffer.from(JSON.stringify(updatedPayload)).toString(
      'base64'
    );
    carrier.ClientContext = encodedPayload;
  }
}
const contextSetter = new ContextSetter();

const injectPropagationContext = (
  invocationRequest: Record<string, any>
): Record<string, any> => {
  propagation.inject(context.active(), invocationRequest, contextSetter);
  return invocationRequest;
};

export class SqsTestCustomServiceExtension extends SqsServiceExtension {
  override requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    return {
      isIncoming: true,
      spanAttributes: {},
      spanKind: SpanKind.INTERNAL,
      spanName: 'custom SQS span',
    };
  }
}
