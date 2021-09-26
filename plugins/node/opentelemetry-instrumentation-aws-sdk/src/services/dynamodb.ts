import { Span, SpanKind, Tracer } from '@opentelemetry/api';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { AwsSdkInstrumentationConfig, NormalizedRequest, NormalizedResponse } from '../types';

export class DynamodbServiceExtension implements ServiceExtension {
    requestPreSpanHook(normalizedRequest: NormalizedRequest): RequestMetadata {
        let spanKind: SpanKind = SpanKind.CLIENT;
        let spanName: string | undefined;
        let isIncoming = false;
        const operation = normalizedRequest.commandName;

        const spanAttributes = {
            [SemanticAttributes.DB_SYSTEM]: 'dynamodb',
            [SemanticAttributes.DB_NAME]: normalizedRequest.commandInput?.TableName,
            [SemanticAttributes.DB_OPERATION]: operation,
            [SemanticAttributes.DB_STATEMENT]: JSON.stringify(normalizedRequest.commandInput),
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

    responseHook(response: NormalizedResponse, span: Span, tracer: Tracer, config: AwsSdkInstrumentationConfig) {
        const operation = response.request.commandName;

        if (operation === 'BatchGetItem') {
            if ('ConsumedCapacity' in response.data) {
                span.setAttribute(
                    SemanticAttributes.AWS_DYNAMODB_CONSUMED_CAPACITY,
                    response.data.ConsumedCapacity.map((x: { [DictionaryKey: string]: any }) => JSON.stringify(x))
                );
            }
        }
    }
}
