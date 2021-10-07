import { Tracer, SpanKind, Span, Context, Link, context, trace } from '@opentelemetry/api';

const START_SPAN_FUNCTION = Symbol('opentelemetry.pubsub-propagation.start_span');
const END_SPAN_FUNCTION = Symbol('opentelemetry.pubsub-propagation.end_span');

const patchArrayFilter = (messages: any[], tracer: Tracer, loopContext: Context) => {
    const origFunc = messages.filter;
    const patchedFunc = function (this: any, ...args: Parameters<typeof origFunc>) {
        const newArray = origFunc.apply(this, args);
        patchArrayForProcessSpans(newArray, tracer, loopContext);
        return newArray;
    };

    Object.defineProperty(messages, 'filter', {
        enumerable: false,
        value: patchedFunc,
    });
};

const patchArrayFunction = (messages: any[], functionName: 'forEach' | 'map', tracer: Tracer, loopContext: Context) => {
    const origFunc = messages[functionName] as typeof messages.map;
    const patchedFunc = function (this: any, callback: any, thisArg: any) {
        const wrappedCallback = function (this: any, message: any) {
            const messageSpan = message?.[START_SPAN_FUNCTION]?.();
            if (!messageSpan) return callback.apply(this, arguments);

            const callbackArgs = arguments;
            const res = context.with(trace.setSpan(loopContext, messageSpan), () => {
                try {
                    return callback.apply(this, callbackArgs);
                } catch (err) {
                    throw err;
                } finally {
                    message[END_SPAN_FUNCTION]?.();
                }
            });

            if (typeof res === 'object') {

                const startSpanFunction = Object.getOwnPropertyDescriptor(message, START_SPAN_FUNCTION);
                startSpanFunction && Object.defineProperty(
                    res,
                    START_SPAN_FUNCTION,
                    startSpanFunction
                );

                const endSpanFunction = Object.getOwnPropertyDescriptor(message, END_SPAN_FUNCTION);
                endSpanFunction && Object.defineProperty(
                    res,
                    END_SPAN_FUNCTION,
                    endSpanFunction
                );
            }
            return res;
        };
        const funcResult = origFunc.call(this, wrappedCallback, thisArg);
        if (Array.isArray(funcResult)) patchArrayForProcessSpans(funcResult, tracer, loopContext);
        return funcResult;
    };

    Object.defineProperty(messages, functionName, {
        enumerable: false,
        value: patchedFunc,
    });
};

const patchArrayForProcessSpans = (messages: any[], tracer: Tracer, loopContext: Context = context.active()) => {
    patchArrayFunction(messages, 'forEach', tracer, loopContext);
    patchArrayFunction(messages, 'map', tracer, loopContext);
    patchArrayFilter(messages, tracer, loopContext);
};

const startMessagingProcessSpan = <T>(
    message: any,
    name: string,
    attributes: Record<string, string>,
    parentContext: Context,
    propagatedContext: Context,
    tracer: Tracer,
    processHook?: ProcessHook<T>
): Span => {
    const links: Link[] = [];
    const spanContext = trace.getSpanContext(propagatedContext);
    if (spanContext) {
        links.push({
            context: spanContext,
        } as Link);
    }

    const spanName = `${name} process`;
    const processSpan = tracer.startSpan(
        spanName,
        {
            kind: SpanKind.CONSUMER,
            attributes: {
                ...attributes,
                ['messaging.operation']: 'process',
            },
            links,
        },
        parentContext
    );

    Object.defineProperty(message, START_SPAN_FUNCTION, {
        enumerable: false,
        writable: true,
        value: () => processSpan,
    });

    Object.defineProperty(message, END_SPAN_FUNCTION, {
        enumerable: false,
        writable: true,
        value: () => {
            processSpan.end();
            Object.defineProperty(message, END_SPAN_FUNCTION, {
                enumerable: false,
                writable: true,
                value: () => {},
            });
        },
    });

    if (processHook) {
        try {
            processHook(processSpan, message);
        } catch {}
    }

    return processSpan;
};

interface SpanDetails {
    attributes: Record<string, any>;
    parentContext: Context;
    name: string;
}

type ProcessHook<T> = (processSpan: Span, message: T) => void;

interface PatchForProcessingPayload<T> {
    messages: T[];
    tracer: Tracer;
    parentContext: Context;
    messageToSpanDetails: (message: T) => SpanDetails;
    processHook?: ProcessHook<T>;
}

const patchMessagesArrayToStartProcessSpans = <T>({
    messages,
    tracer,
    parentContext,
    messageToSpanDetails,
    processHook,
}: PatchForProcessingPayload<T>) => {
    messages.forEach((message) => {
        const { attributes, name, parentContext: propagatedContext } = messageToSpanDetails(message);

        Object.defineProperty(message, START_SPAN_FUNCTION, {
            enumerable: false,
            writable: true,
            value: () =>
                startMessagingProcessSpan<T>(
                    message,
                    name,
                    attributes,
                    parentContext,
                    propagatedContext,
                    tracer,
                    processHook
                ),
        });
    });
};

export default {
    patchMessagesArrayToStartProcessSpans,
    patchArrayForProcessSpans,
};
