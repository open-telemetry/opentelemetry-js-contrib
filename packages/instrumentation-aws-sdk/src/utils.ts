/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Attributes, Context, context } from '@opentelemetry/api';
import { ATTR_RPC_METHOD, ATTR_RPC_SERVICE, ATTR_RPC_SYSTEM } from './semconv';
import { AttributeNames } from './enums';
import { NormalizedRequest } from './types';

export const removeSuffixFromStringIfExists = (
  str: string,
  suffixToRemove: string
): string => {
  const suffixLength = suffixToRemove.length;
  return str?.slice(-suffixLength) === suffixToRemove
    ? str.slice(0, str.length - suffixLength)
    : str;
};

export const normalizeV3Request = (
  serviceName: string,
  commandNameWithSuffix: string,
  commandInput: Record<string, any>,
  region: string | undefined
): NormalizedRequest => {
  return {
    serviceName: serviceName?.replace(/\s+/g, ''),
    commandName: removeSuffixFromStringIfExists(
      commandNameWithSuffix,
      'Command'
    ),
    commandInput,
    region,
  };
};

export const extractAttributesFromNormalizedRequest = (
  normalizedRequest: NormalizedRequest
): Attributes => {
  return {
    [ATTR_RPC_SYSTEM]: 'aws-api',
    [ATTR_RPC_METHOD]: normalizedRequest.commandName,
    [ATTR_RPC_SERVICE]: normalizedRequest.serviceName,
    [AttributeNames.CLOUD_REGION]: normalizedRequest.region,
  };
};

export const bindPromise = <T = unknown>(
  target: Promise<T>,
  contextForCallbacks: Context,
  rebindCount = 1
): Promise<T> => {
  const origThen = target.then;
  type PromiseThenParameters = Parameters<Promise<T>['then']>;
  target.then = function <TResult1 = T, TResult2 = never>(
    onFulfilled: PromiseThenParameters[0],
    onRejected: PromiseThenParameters[1]
  ): Promise<TResult1 | TResult2> {
    const newOnFulfilled = context.bind(contextForCallbacks, onFulfilled);
    const newOnRejected = context.bind(contextForCallbacks, onRejected);
    const patchedPromise = origThen.call<
      Promise<T>,
      any[],
      Promise<TResult1 | TResult2>
    >(this, newOnFulfilled, newOnRejected);
    return rebindCount > 1
      ? bindPromise(patchedPromise, contextForCallbacks, rebindCount - 1)
      : patchedPromise;
  };
  return target;
};
