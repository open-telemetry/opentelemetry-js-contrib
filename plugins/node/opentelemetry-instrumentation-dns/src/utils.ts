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

import { Span, SpanStatusCode, SpanAttributes } from '@opentelemetry/api';
import { AttributeNames } from './enums/AttributeNames';
import { AddressFamily } from './enums/AddressFamily';
import * as dns from 'dns';
import { IgnoreMatcher } from './types';

/**
 * Set error attributes on the span passed in params
 * @param err the error that we use for filling the attributes
 * @param span the span to be set
 * @param nodeVersion the node version
 */
export const setError = (
  err: NodeJS.ErrnoException,
  span: Span,
  nodeVersion: string
) => {
  const { code, message, name } = err;
  const attributes = {
    [AttributeNames.DNS_ERROR_MESSAGE]: message,
    [AttributeNames.DNS_ERROR_NAME]: name,
  } as SpanAttributes;

  if (nodeVersion.startsWith('v12')) {
    attributes[AttributeNames.DNS_ERROR_CODE] = code!;
  }

  span.setAttributes(attributes);

  span.setStatus({
    code: SpanStatusCode.ERROR,
    message,
  });
};

/**
 * Returns the family attribute name to be set on the span
 * @param family `4` (ipv4) or `6` (ipv6). `0` means bug.
 * @param [index] `4` (ipv4) or `6` (ipv6). `0` means bug.
 */
export const getFamilyAttribute = (
  family: AddressFamily,
  index?: number
): string => {
  return index ? `peer[${index}].ipv${family}` : `peer.ipv${family}`;
};

/**
 * Returns the span name
 * @param funcName function name that is wrapped (e.g `lookup`)
 * @param [service] e.g `http`
 */
export const getOperationName = (
  funcName: string,
  service?: string
): string => {
  return service ? `dns.${service}/${funcName}` : `dns.${funcName}`;
};

export const setLookupAttributes = (
  span: Span,
  address: string | dns.LookupAddress[] | dns.LookupAddress,
  family?: number
) => {
  const attributes = {} as SpanAttributes;
  const isObject = typeof address === 'object';
  let addresses = address;

  if (!isObject) {
    addresses = [{ address, family } as dns.LookupAddress];
  } else if (!(addresses instanceof Array)) {
    addresses = [
      {
        address: (address as dns.LookupAddress).address,
        family: (address as dns.LookupAddress).family,
      } as dns.LookupAddress,
    ];
  }

  addresses.forEach((_, i) => {
    const peerAttrFormat = getFamilyAttribute(_.family, i);
    attributes[peerAttrFormat] = _.address;
  });

  span.setAttributes(attributes);
};

/**
 * Check whether the given obj match pattern
 * @param constant e.g URL of request
 * @param obj obj to inspect
 * @param pattern Match pattern
 */
export const satisfiesPattern = (
  constant: string,
  pattern: IgnoreMatcher
): boolean => {
  if (typeof pattern === 'string') {
    return pattern === constant;
  } else if (pattern instanceof RegExp) {
    return pattern.test(constant);
  } else if (typeof pattern === 'function') {
    return pattern(constant);
  } else {
    throw new TypeError('Pattern is in unsupported datatype');
  }
};

/**
 * Check whether the given dns request is ignored by configuration
 * It will not re-throw exceptions from `list` provided by the client
 * @param constant e.g URL of request
 * @param [list] List of ignore patterns
 * @param [onException] callback for doing something when an exception has
 *     occurred
 */
export const isIgnored = (
  constant: string,
  list?: IgnoreMatcher[],
  onException?: (error: Error) => void
): boolean => {
  if (!list) {
    // No ignored urls - trace everything
    return false;
  }
  // Try/catch outside the loop for failing fast
  try {
    for (const pattern of list) {
      if (satisfiesPattern(constant, pattern)) {
        return true;
      }
    }
  } catch (e) {
    if (onException) {
      onException(e);
    }
  }

  return false;
};
