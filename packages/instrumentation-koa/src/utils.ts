/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { KoaLayerType, KoaInstrumentationConfig } from './types';
import { KoaContext, KoaMiddleware } from './internal-types';
import { AttributeNames } from './enums/AttributeNames';
import { Attributes } from '@opentelemetry/api';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';

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
        [ATTR_HTTP_ROUTE]: layerPath?.toString(),
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
 * Check whether the given request is ignored by configuration
 * @param [list] List of ignore patterns
 * @param [onException] callback for doing something when an exception has
 *     occurred
 */
export const isLayerIgnored = (
  type: KoaLayerType,
  config?: KoaInstrumentationConfig
): boolean => {
  return !!(
    Array.isArray(config?.ignoreLayersType) &&
    config?.ignoreLayersType?.includes(type)
  );
};
