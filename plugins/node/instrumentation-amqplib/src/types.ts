import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type * as amqp from 'amqplib';

export interface PublishParams {
    exchange: string;
    routingKey: string;
    content: Buffer;
    options?: amqp.Options.Publish;
    isConfirmChannel?: boolean;
}

export interface AmqplibPublishCustomAttributeFunction {
    (span: Span, publishParams: PublishParams): void;
}

export interface AmqplibConfirmCustomAttributeFunction {
    (span: Span, publishParams: PublishParams, confirmError: any): void;
}

export interface AmqplibConsumerCustomAttributeFunction {
    (span: Span, msg: amqp.ConsumeMessage): void;
}

export interface AmqplibConsumerEndCustomAttributeFunction {
    (span: Span, msg: amqp.ConsumeMessage, rejected: boolean | null, endOperation: EndOperation): void;
}

export enum EndOperation {
    AutoAck = 'auto ack',
    Ack = 'ack',
    AckAll = 'ackAll',
    Reject = 'reject',
    Nack = 'nack',
    NackAll = 'nackAll',
    ChannelClosed = 'channel closed',
    ChannelError = 'channel error',
    InstrumentationTimeout = 'instrumentation timeout',
}

export interface AmqplibInstrumentationConfig extends InstrumentationConfig {
    /** hook for adding custom attributes before publish message is sent */
    publishHook?: AmqplibPublishCustomAttributeFunction;

    /** hook for adding custom attributes after publish message is confirmed by the broker */
    publishConfirmHook?: AmqplibConfirmCustomAttributeFunction;

    /** hook for adding custom attributes before consumer message is processed */
    consumeHook?: AmqplibConsumerCustomAttributeFunction;

    /** hook for adding custom attributes after consumer message is acked to server */
    consumeEndHook?: AmqplibConsumerEndCustomAttributeFunction;

    /**
     * If passed, a span attribute will be added to all spans with key of the provided "moduleVersionAttributeName"
     * and value of the module version.
     */
    moduleVersionAttributeName?: string;

    /**
     * When user is setting up consume callback, it is user's responsibility to call
     * ack/nack etc on the msg to resolve it in the server.
     * If user is not calling the ack, the message will stay in the queue until
     * channel is closed, or until server timeout expires (if configured).
     * While we wait for the ack, a copy of the message is stored in plugin, which
     * will never be garbage collected.
     * To prevent memory leak, plugin has it's own configuration of timeout, which
     * will close the span if user did not call ack after this timeout.
     * If timeout is not big enough, span might be closed with 'InstrumentationTimeout',
     * and then received valid ack from the user later which will not be instrumented.
     *
     * Default is 1 minute
     */
    consumeTimeoutMs?: number;
}

export const DEFAULT_CONFIG: AmqplibInstrumentationConfig = {
    consumeTimeoutMs: 1000 * 60, // 1 minute
};
