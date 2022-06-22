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
  KoaContext,
  KoaMiddleware,
  KoaLayerType,
  KoaInstrumentationConfig,
} from './types';
import { AttributeNames } from './enums/AttributeNames';
import { SpanAttributes } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

export const getMiddlewareMetadata = (
  context: KoaContext,
  layer: KoaMiddleware,
  isRouter: boolean,
  layerPath?: string
): {
  attributes: SpanAttributes;
  name: string;
} => {
  if (isRouter) {
    return {
      attributes: {
        [AttributeNames.KOA_NAME]: layerPath,
        [AttributeNames.KOA_TYPE]: KoaLayerType.ROUTER,
        [SemanticAttributes.HTTP_ROUTE]: layerPath,
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
