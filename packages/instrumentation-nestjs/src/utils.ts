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

import * as api from '@opentelemetry/api';
import type { Controller } from '@nestjs/common/interfaces';
import { AttributeNames, NestType } from './enums';
import type {
  EventOrMessageListenerDefinition,
  InstanceWrapperLike,
  MicroserviceContextDefinition,
} from './internal-types';

type HandlerWrapperParams = {
  tracer: api.Tracer;
  moduleVersion: string | undefined;
  handler: Function;
  nestType: NestType;
  commonAttributes: api.Attributes;
};

type MessageHandlerContextWrapperParams = {
  tracer: api.Tracer;
  moduleVersion: string | undefined;
  handler: Function;
  definition: MicroserviceContextDefinition;
  commonAttributes: api.Attributes;
};

export function createWrapHandler({
  tracer,
  moduleVersion,
  handler,
  nestType,
  commonAttributes,
}: HandlerWrapperParams) {
  const spanName = handler.name || 'anonymous nest handler';
  const options = {
    attributes: {
      ...commonAttributes,
      [AttributeNames.VERSION]: moduleVersion,
      [AttributeNames.TYPE]: nestType,
      [AttributeNames.CALLBACK]: handler.name,
    },
  };
  const wrappedHandler = function (this: unknown) {
    const span = tracer.startSpan(spanName, options);
    return executeWithSpan(span, () => handler.apply(this, arguments));
  };

  cloneFunctionName(handler, wrappedHandler);
  cloneFunctionMetadata(handler, wrappedHandler);
  return wrappedHandler;
}

export function createWrapMessageHandlerContext({
  tracer,
  moduleVersion,
  handler,
  definition,
  commonAttributes,
}: MessageHandlerContextWrapperParams) {
  const spanName = definition.callbackName
    ? `${definition.instanceName}.${definition.callbackName}`
    : definition.instanceName;
  const attributes: api.Attributes = {
    ...commonAttributes,
    [AttributeNames.VERSION]: moduleVersion,
    [AttributeNames.TYPE]: NestType.MESSAGE_CONTEXT,
    [AttributeNames.CONTROLLER]: definition.instanceName,
    [AttributeNames.CALLBACK]: definition.callbackName,
    [AttributeNames.PATTERN]: serializeAttributeValue(definition.pattern),
  };
  const transportId = serializeAttributeValue(definition.transportId);
  if (transportId !== undefined) {
    attributes[AttributeNames.TRANSPORT] = transportId;
  }

  const wrappedHandler = createContextWrapper(
    spanName,
    tracer,
    attributes,
    handler
  );
  cloneFunctionName(handler, wrappedHandler);
  return wrappedHandler;
}

export function createContextWrapper(
  spanName: string,
  tracer: api.Tracer,
  attributes: api.Attributes,
  handler: Function
) {
  return function wrappedContext(this: unknown) {
    const span = tracer.startSpan(spanName, { attributes });
    return executeWithSpan(span, () => handler.apply(this, arguments));
  };
}

export function buildMicroserviceContextDefinitions(
  definitions: EventOrMessageListenerDefinition[] | undefined,
  instanceWrapper: InstanceWrapperLike,
  transportId: unknown
): MicroserviceContextDefinition[] {
  if (!Array.isArray(definitions)) {
    return [];
  }

  const instanceName =
    instanceWrapper.metatype?.name || getInstanceName(instanceWrapper.instance);

  return definitions
    .filter(
      definition =>
        typeof definition.transport === 'undefined' ||
        typeof transportId === 'undefined' ||
        definition.transport === transportId
    )
    .flatMap(definition => {
      const callbackName =
        definition.targetCallback?.name || definition.methodKey;
      return getDefinitionPatterns(definition).map((pattern: unknown) => ({
        callbackName,
        instanceName,
        pattern,
        transportId,
      }));
    });
}

function getDefinitionPatterns(
  definition: EventOrMessageListenerDefinition
): unknown[] {
  if (Array.isArray(definition.patterns)) {
    return definition.patterns;
  }

  if (typeof definition.pattern !== 'undefined') {
    return [definition.pattern];
  }

  return [];
}

export function getInstanceName(instance: Controller | undefined) {
  return instance?.constructor?.name || 'UnnamedInstance';
}

export function getTransportAttribute(options: unknown) {
  const transport = (options as { transport?: unknown } | undefined)?.transport;
  if (typeof transport !== 'undefined') {
    return serializeAttributeValue(transport);
  }

  const strategyName = (
    options as { strategy?: { constructor?: { name?: string } } } | undefined
  )?.strategy?.constructor?.name;
  return strategyName || undefined;
}

export function serializeAttributeValue(value: unknown) {
  if (typeof value === 'undefined') {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'symbol') {
    return value.toString();
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function executeWithSpan<T>(span: api.Span, callback: () => T): T {
  const spanContext = api.trace.setSpan(api.context.active(), span);

  return api.context.with(spanContext, () => {
    try {
      const result = callback();
      if (isPromiseLike(result)) {
        return result
          .catch((error: unknown) => {
            throw addError(span, asError(error));
          })
          .finally(() => span.end()) as T;
      }

      span.end();
      return result;
    } catch (error: unknown) {
      const tracedError = addError(span, asError(error));
      span.end();
      throw tracedError;
    }
  });
}

export function addError(span: api.Span, error: Error) {
  span.recordException(error);
  span.setStatus({ code: api.SpanStatusCode.ERROR, message: error.message });
  return error;
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T> | undefined)?.then === 'function';
}

function asError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(serializeAttributeValue(error) || 'Unknown NestJS error');
}

function cloneFunctionName(source: Function, target: Function) {
  if (source.name) {
    Object.defineProperty(target, 'name', { value: source.name });
  }
}

function cloneFunctionMetadata(source: Function, target: Function) {
  const reflected = Reflect as typeof Reflect & {
    defineMetadata: (
      metadataKey: unknown,
      metadataValue: unknown,
      target: Function
    ) => void;
    getMetadata: (metadataKey: unknown, target: Function) => unknown;
    getMetadataKeys: (target: Function) => unknown[];
  };

  reflected.getMetadataKeys(source).forEach((metadataKey: unknown) => {
    reflected.defineMetadata(
      metadataKey,
      reflected.getMetadata(metadataKey, source),
      target
    );
  });
}
