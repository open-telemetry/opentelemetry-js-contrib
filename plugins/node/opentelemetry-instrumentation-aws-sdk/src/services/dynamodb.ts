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
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import {
  DbSystemValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import {
  AwsSdkInstrumentationConfig,
  NormalizedRequest,
  NormalizedResponse,
} from '../types';

export class DynamodbServiceExtension implements ServiceExtension {
  requestPreSpanHook(normalizedRequest: NormalizedRequest): RequestMetadata {
    const spanKind: SpanKind = SpanKind.CLIENT;
    let spanName: string | undefined;
    const isIncoming = false;
    const operation = normalizedRequest.commandName;

    const spanAttributes = {
      [SemanticAttributes.DB_SYSTEM]: DbSystemValues.DYNAMODB,
      [SemanticAttributes.DB_NAME]: normalizedRequest.commandInput?.TableName,
      [SemanticAttributes.DB_OPERATION]: operation,
      [SemanticAttributes.DB_STATEMENT]: JSON.stringify(
        normalizedRequest.commandInput
      ),
    };

    if (operation == 'BatchGetItem') {
      spanAttributes[SemanticAttributes.AWS_DYNAMODB_TABLE_NAMES] = Object.keys(
        normalizedRequest.commandInput.RequestItems
      );
    }

    return {
      isIncoming,
      spanAttributes,
      spanKind,
      spanName,
    };
  }

  responseHook(
    response: NormalizedResponse,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig
  ) {
    const operation = response.request.commandName;

    if (operation === 'BatchGetItem') {
      if (Array.isArray(response.data?.ConsumedCapacity)) {
        span.setAttribute(
          SemanticAttributes.AWS_DYNAMODB_CONSUMED_CAPACITY,
          response.data.ConsumedCapacity.map(
            (x: { [DictionaryKey: string]: any }) => JSON.stringify(x)
          )
        );
      }
    }
  }
}
