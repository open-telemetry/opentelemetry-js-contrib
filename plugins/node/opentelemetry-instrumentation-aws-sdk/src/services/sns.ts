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
import { Span, Tracer, SpanKind, propagation } from "@opentelemetry/api";
import { MessagingDestinationKindValues, SemanticAttributes } from "@opentelemetry/semantic-conventions";
import { NormalizedRequest, NormalizedResponse, AwsSdkInstrumentationConfig } from "../types";
import { InjectPropagationContext } from "./MessageAttributes";
import { RequestMetadata, ServiceExtension } from "./ServiceExtension";

export class SnsServiceExtension implements ServiceExtension {
    requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
        let spanKind: SpanKind = SpanKind.CLIENT;
        let spanName: string = `SNS ${request.commandName}`;

        const spanAttributes = {
            [SemanticAttributes.MESSAGING_SYSTEM]: 'aws.sns',
            [SemanticAttributes.MESSAGING_DESTINATION_KIND]: MessagingDestinationKindValues.TOPIC,
            [SemanticAttributes.MESSAGING_DESTINATION]: request.commandInput.TopicArn ||
                request.commandInput.TargetArn ||
                request.commandInput.PhoneNumber
        };

        if (request.commandName === 'Publish') {
            spanKind = SpanKind.PRODUCER;

            request.commandInput.MessageAttributeNames = (
                request.commandInput.MessageAttributeNames ?? []
            ).concat(propagation.fields());
        }

        return {
            isIncoming: false,
            spanAttributes,
            spanKind,
            spanName,
        };
    }

    requestPostSpanHook(request: NormalizedRequest): void {
        if (request.commandName === 'publish') {
            const origMessageAttributes = request.commandInput['MessageAttributes'] ?? {};
            if (origMessageAttributes) {
                request.commandInput['MessageAttributes'] =
                    InjectPropagationContext(origMessageAttributes);
            }
        }
    }

    responseHook(response: NormalizedResponse, span: Span, tracer: Tracer, config: AwsSdkInstrumentationConfig): void {
    }
}