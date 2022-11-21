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
  Tracer,
  SpanKind,
  Span,
  propagation,
  context,
  TextMapSetter,
} from '@opentelemetry/api';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import {
  AwsSdkInstrumentationConfig,
  NormalizedRequest,
  NormalizedResponse,
} from '../types';
import {
  MessagingDestinationKindValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import { EventBridge } from 'aws-sdk';

class ContextSetter
  implements TextMapSetter<EventBridge.PutEventsRequestEntry>
{
  set(carrier: EventBridge.PutEventsRequestEntry, key: string, value: string) {
    carrier['TraceHeader'] = value as string;
  }
}
export const contextSetter = new ContextSetter();

export class EventBridgeServiceExtension implements ServiceExtension {
  requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    let spanKind: SpanKind = SpanKind.CLIENT;
    let spanName: string | undefined;

    const spanAttributes = {
      [SemanticAttributes.MESSAGING_SYSTEM]: 'aws.eventbridge',
      [SemanticAttributes.MESSAGING_DESTINATION_KIND]:
        MessagingDestinationKindValues.TOPIC,
      [SemanticAttributes.MESSAGING_DESTINATION]:
        request.commandInput.EndpointId,
    };

    let isIncoming = false;

    switch (request.commandName) {
      case 'PutEvents':
        spanKind = SpanKind.PRODUCER;
        spanName = `Event bridge put`;
        break;
    }

    return {
      isIncoming,
      spanAttributes,
      spanKind,
      spanName,
    };
  }

  requestPostSpanHook = (request: NormalizedRequest) => {
    switch (request.commandName) {
      case 'PutEvents':
        request.commandInput?.Entries?.forEach(
          (entry: EventBridge.PutEventsRequestEntry) => {
            propagation.inject(context.active(), entry, contextSetter);
          }
        );
        break;
    }
  };

  responseHook = (
    response: NormalizedResponse,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig
  ) => {
    
  };
}
