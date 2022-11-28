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
  Context,
  Link,
  context,
  trace,
  diag,
  SpanAttributes,
} from '@opentelemetry/api';

const START_SPAN_FUNCTION = Symbol(
  'opentelemetry.pubsub-propagation.start_span'
);
const END_SPAN_FUNCTION = Symbol('opentelemetry.pubsub-propagation.end_span');

interface OtelProcessedMessage {
  [START_SPAN_FUNCTION]?: () => Span;
  [END_SPAN_FUNCTION]?: () => void;
}

const patchArrayFilter = (
  messages: unknown[],
  tracer: Tracer,
  loopContext: Context
) => {
  const origFunc = messages.filter;
  const patchedFunc = function (
    this: unknown,
    ...args: Parameters<typeof origFunc>
  ) {
    const newArray = origFunc.apply(this, args);
    patchArrayForProcessSpans(newArray, tracer, loopContext);
    return newArray;
  };

  Object.defineProperty(messages, 'filter', {
    enumerable: false,
    value: patchedFunc,
  });
};

function isPromise(value: unknown): value is Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof (value as any)?.then === 'function';
}

const patchArrayFunction = (
  messages: OtelProcessedMessage[],
  functionName: 'forEach' | 'map',
  tracer: Tracer,
  loopContext: Context
) => {
  const origFunc = messages[functionName] as typeof messages.map;
  const patchedFunc = function (
    this: unknown,
    ...arrFuncArgs: Parameters<typeof origFunc>
  ) {
    const callback = arrFuncArgs[0];
    const wrappedCallback = function (
      this: unknown,
      ...callbackArgs: Parameters<typeof callback>
    ) {
      const message = callbackArgs[0];
      const messageSpan = message?.[START_SPAN_FUNCTION]?.();
      if (!messageSpan) return callback.apply(this, callbackArgs);

      const res = context.with(trace.setSpan(loopContext, messageSpan), () => {
        let result: Promise<unknown> | unknown;
        try {
          result = callback.apply(this, callbackArgs);
          if (isPromise(result)) {
            const endSpan = () => message[END_SPAN_FUNCTION]?.();
            result.then(endSpan, endSpan);
          }
          return result;
        } finally {
          if (!isPromise(result)) {
            message[END_SPAN_FUNCTION]?.();
          }
        }
      });

      if (typeof res === 'object') {
        const startSpanFunction = Object.getOwnPropertyDescriptor(
          message,
          START_SPAN_FUNCTION
        );
        startSpanFunction &&
          Object.defineProperty(res, START_SPAN_FUNCTION, startSpanFunction);

        const endSpanFunction = Object.getOwnPropertyDescriptor(
          message,
          END_SPAN_FUNCTION
        );
        endSpanFunction &&
          Object.defineProperty(res, END_SPAN_FUNCTION, endSpanFunction);
      }
      return res;
    };
    arrFuncArgs[0] = wrappedCallback;
    const funcResult = origFunc.apply(this, arrFuncArgs);
    if (Array.isArray(funcResult))
      patchArrayForProcessSpans(funcResult, tracer, loopContext);
    return funcResult;
  };

  Object.defineProperty(messages, functionName, {
    enumerable: false,
    value: patchedFunc,
  });
};

const patchArrayForProcessSpans = (
  messages: unknown[],
  tracer: Tracer,
  loopContext: Context = context.active()
) => {
  patchArrayFunction(
    messages as OtelProcessedMessage[],
    'forEach',
    tracer,
    loopContext
  );
  patchArrayFunction(
    messages as OtelProcessedMessage[],
    'map',
    tracer,
    loopContext
  );
  patchArrayFilter(messages, tracer, loopContext);
};

const startMessagingProcessSpan = <T>(
  message: T,
  name: string,
  attributes: SpanAttributes,
  parentContext: Context,
  propagatedContext: Context,
  tracer: Tracer,
  processHook?: ProcessHook<T>,
  propagatedContextAsActive?: boolean
): Span => {
  const links: Link[] = [];
  const spanContext = trace.getSpanContext(propagatedContextAsActive ? parentContext : propagatedContext);
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
    propagatedContextAsActive ? propagatedContext : parentContext
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

  try {
    processHook?.(processSpan, message);
  } catch (err) {
    diag.error('opentelemetry-pubsub-propagation: process hook error', err);
  }

  return processSpan;
};

interface SpanDetails {
  attributes: SpanAttributes;
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
  propagatedContextAsActive?: boolean;
}

const patchMessagesArrayToStartProcessSpans = <T>({
  messages,
  tracer,
  parentContext,
  messageToSpanDetails,
  processHook,
  propagatedContextAsActive
}: PatchForProcessingPayload<T>) => {
  messages.forEach(message => {
    const {
      attributes,
      name,
      parentContext: propagatedContext,
    } = messageToSpanDetails(message);

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
          processHook,
          propagatedContextAsActive
        ),
    });
  });
};

export default {
  patchMessagesArrayToStartProcessSpans,
  patchArrayForProcessSpans,
};
