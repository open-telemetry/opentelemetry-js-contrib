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
import { KoaLayerType, KoaInstrumentationConfig, IgnoreMatcher } from './types';
import { KoaContext, KoaMiddleware } from './internal-types';
import { AttributeNames } from './enums/AttributeNames';
import { Attributes } from '@opentelemetry/api';
import { SEMATTRS_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';

export const getMiddlewareMetadata = (
  context: KoaContext,
  layer: KoaMiddleware,
  isRouter: boolean,
  layerPath?: string | RegExp
): {
  attributes: Attributes;
  name: string;
} => {
  if (isRouter) {
    return {
      attributes: {
        [AttributeNames.KOA_NAME]: layerPath?.toString(),
        [AttributeNames.KOA_TYPE]: KoaLayerType.ROUTER,
        [SEMATTRS_HTTP_ROUTE]: layerPath?.toString(),
      },
      name: context._matchedRouteName || `router - ${layerPath}`,
    };
  } else {
    return {
      attributes: {
        [AttributeNames.KOA_NAME]: layer.name ?? 'middleware',
        [AttributeNames.KOA_TYPE]: KoaLayerType.MIDDLEWARE,
      },
      name: `middleware - ${layer.name}`,
    };
  }
};

/**
 * Check whether the given request layer type is ignored by configuration
 * @param [list] List of ignore patterns
 * @param [onException] callback for doing something when an exception has
 *     occurred
 */
export const isLayerTypeIgnored = (
  type: KoaLayerType,
  config?: KoaInstrumentationConfig
): boolean => {
  return !!(
    Array.isArray(config?.ignoreLayersType) &&
    config?.ignoreLayersType?.includes(type)
  );
};

/**
 * Check whether the given request layer name is ignored by configuration
 * @param [list] List of ignore patterns
 * @param [onException] callback for doing something when an exception has
 *     occurred
 */
export const isLayerNameIgnored = (
  name: string,
  config?: KoaInstrumentationConfig
): boolean => {
  if (Array.isArray(config?.ignoreLayers) === false || !config?.ignoreLayers)
    return false;
  try {
    for (const pattern of config.ignoreLayers) {
      if (satisfiesPattern(name, pattern)) {
        return true;
      }
    }
  } catch (e) {
    /* catch block*/
  }

  return false;
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
  console.warn(`constant: ${constant}`);
  console.warn(`pattern: ${pattern}`);
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
