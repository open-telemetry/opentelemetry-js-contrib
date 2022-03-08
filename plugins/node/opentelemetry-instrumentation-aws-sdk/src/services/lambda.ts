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
  Span,
  SpanKind,
  Tracer,
  diag,
  SpanAttributes,
} from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import {
  AwsSdkInstrumentationConfig,
  NormalizedRequest,
  NormalizedResponse,
} from '../types';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import { context, propagation } from '@opentelemetry/api';

class LambdaCommands {
  public static readonly Invoke: string = 'Invoke';
}

export class LambdaServiceExtension implements ServiceExtension {
  requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    const functionName = this.extractFunctionName(request.commandInput);

    let spanAttributes: SpanAttributes = {};
    let spanName: string | undefined;

    switch (request.commandName) {
      case 'Invoke':
        spanAttributes = {
          [SemanticAttributes.FAAS_INVOKED_NAME]: functionName,
          [SemanticAttributes.FAAS_INVOKED_PROVIDER]: 'aws',
        };
        if (request.region) {
          spanAttributes[SemanticAttributes.FAAS_INVOKED_REGION] =
            request.region;
        }
        spanName = `${functionName} ${LambdaCommands.Invoke}`;
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
      case LambdaCommands.Invoke:
        {
          if (request.commandInput) {
            request.commandInput.ClientContext = injectLambdaPropagationContext(
              request.commandInput.ClientContext
            );
          }
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
    switch (response.request.commandName) {
      case LambdaCommands.Invoke:
        {
          span.setAttribute(
            SemanticAttributes.FAAS_EXECUTION,
            response.requestId
          );
        }
        break;
    }
  }

  extractFunctionName = (commandInput: Record<string, any>): string => {
    return commandInput?.FunctionName;
  };
}

const injectLambdaPropagationContext = (
  clientContext: string | undefined
): string | undefined => {
  try {
    const propagatedContext = {};
    propagation.inject(context.active(), propagatedContext);

    const parsedClientContext = clientContext
      ? JSON.parse(Buffer.from(clientContext, 'base64').toString('utf8'))
      : {};

    const updatedClientContext = {
      ...parsedClientContext,
      Custom: {
        ...parsedClientContext.Custom,
        ...propagatedContext,
      },
    };

    const encodedClientContext = Buffer.from(
      JSON.stringify(updatedClientContext)
    ).toString('base64');

    // The length of client context is capped at 3583 bytes of base64 encoded data
    // (https://docs.aws.amazon.com/lambda/latest/dg/API_Invoke.html#API_Invoke_RequestSyntax)
    if (encodedClientContext.length > 3583) {
      diag.warn(
        'lambda instrumentation: cannot set context propagation on lambda invoke parameters due to ClientContext length limitations.'
      );
      return clientContext;
    }

    return encodedClientContext;
  } catch (e) {
    diag.debug(
      'lambda instrumentation: failed to set context propagation on ClientContext',
      e
    );
    return clientContext;
  }
};
