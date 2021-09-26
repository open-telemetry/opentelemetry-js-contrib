import { Span, SpanAttributes, SpanKind, Tracer } from '@opentelemetry/api';
import { AwsSdkInstrumentationConfig, NormalizedRequest, NormalizedResponse } from '../types';

export interface RequestMetadata {
    // isIncoming - if true, then the operation callback / promise should be bind with the operation's span
    isIncoming: boolean;
    spanAttributes?: SpanAttributes;
    spanKind?: SpanKind;
    spanName?: string;
}

export interface ServiceExtension {
    // called before request is sent, and before span is started
    requestPreSpanHook: (request: NormalizedRequest) => RequestMetadata;

    // called before request is sent, and after span is started
    requestPostSpanHook?: (request: NormalizedRequest) => void;

    responseHook?: (
        response: NormalizedResponse,
        span: Span,
        tracer: Tracer,
        config: AwsSdkInstrumentationConfig
    ) => void;
}
