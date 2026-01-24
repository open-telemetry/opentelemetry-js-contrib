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

import { Attributes } from '@opentelemetry/api';
import {
  IgnoreMatcher,
  ExpressInstrumentationConfig,
  LayerPathSegment,
} from './types';
import { ExpressLayerType } from './enums/ExpressLayerType';
import { AttributeNames } from './enums/AttributeNames';
import {
  ExpressLayer,
  PatchedRequest,
  _LAYERS_STORE_PROPERTY,
} from './internal-types';

/**
 * Store layers path in the request to be able to construct route later
 * @param request The request where
 * @param [value] the value to push into the array
 */
export const storeLayerPath = (
  request: PatchedRequest,
  value?: string
): { isLayerPathStored: boolean } => {
  if (Array.isArray(request[_LAYERS_STORE_PROPERTY]) === false) {
    Object.defineProperty(request, _LAYERS_STORE_PROPERTY, {
      enumerable: false,
      value: [],
    });
  }
  if (value === undefined) return { isLayerPathStored: false };

  (request[_LAYERS_STORE_PROPERTY] as string[]).push(value);

  return { isLayerPathStored: true };
};

/**
 * Recursively search the router path from layer stack
 * @param path The path to reconstruct
 * @param layer The layer to reconstruct from
 * @returns The reconstructed path
 */
export const getRouterPath = (path: string, layer: ExpressLayer): string => {
  const stackLayer = layer.handle?.stack?.[0];

  if (stackLayer?.route?.path) {
    return `${path}${stackLayer.route.path}`;
  }

  if (stackLayer?.handle?.stack) {
    return getRouterPath(path, stackLayer);
  }

  return path;
};

/**
 * Parse express layer context to retrieve a name and attributes.
 * @param route The route of the layer
 * @param layer Express layer
 * @param [layerPath] if present, the path on which the layer has been mounted
 */
export const getLayerMetadata = (
  route: string,
  layer: ExpressLayer,
  layerPath?: string
): {
  attributes: Attributes;
  name: string;
} => {
  if (layer.name === 'router') {
    const maybeRouterPath = getRouterPath('', layer);
    const extractedRouterPath = maybeRouterPath
      ? maybeRouterPath
      : layerPath || route || '/';

    return {
      attributes: {
        [AttributeNames.EXPRESS_NAME]: extractedRouterPath,
        [AttributeNames.EXPRESS_TYPE]: ExpressLayerType.ROUTER,
      },
      name: `router - ${extractedRouterPath}`,
    };
  } else if (layer.name === 'bound dispatch' || layer.name === 'handle') {
    return {
      attributes: {
        [AttributeNames.EXPRESS_NAME]:
          (route || layerPath) ?? 'request handler',
        [AttributeNames.EXPRESS_TYPE]: ExpressLayerType.REQUEST_HANDLER,
      },
      name: `request handler${layer.path ? ` - ${route || layerPath}` : ''}`,
    };
  } else {
    return {
      attributes: {
        [AttributeNames.EXPRESS_NAME]: layer.name,
        [AttributeNames.EXPRESS_TYPE]: ExpressLayerType.MIDDLEWARE,
      },
      name: `middleware - ${layer.name}`,
    };
  }
};

/**
 * Check whether the given obj match pattern
 * @param constant e.g URL of request
 * @param obj obj to inspect
 * @param pattern Match pattern
 */
const satisfiesPattern = (
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
 * Check whether the given request is ignored by configuration
 * It will not re-throw exceptions from `list` provided by the client
 * @param constant e.g URL of request
 * @param [list] List of ignore patterns
 * @param [onException] callback for doing something when an exception has
 *     occurred
 */
export const isLayerIgnored = (
  name: string,
  type: ExpressLayerType,
  config?: ExpressInstrumentationConfig
): boolean => {
  if (
    Array.isArray(config?.ignoreLayersType) &&
    config?.ignoreLayersType?.includes(type)
  ) {
    return true;
  }
  if (Array.isArray(config?.ignoreLayers) === false) return false;
  try {
    for (const pattern of config!.ignoreLayers!) {
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
 * Converts a user-provided error value into an error and error message pair
 *
 * @param error - User-provided error value
 * @returns Both an Error or string representation of the value and an error message
 */
export const asErrorAndMessage = (
  error: unknown
): [error: string | Error, message: string] =>
  error instanceof Error
    ? [error, error.message]
    : [String(error), String(error)];

/**
 * Extracts the layer path from the route arguments
 *
 * @param args - Arguments of the route
 * @returns The layer path
 */
export const getLayerPath = (
  args: [LayerPathSegment | LayerPathSegment[], ...unknown[]]
): string | undefined => {
  const firstArg = args[0];

  if (Array.isArray(firstArg)) {
    return firstArg.map(arg => extractLayerPathSegment(arg) || '').join(',');
  }

  return extractLayerPathSegment(firstArg);
};

const extractLayerPathSegment = (arg: LayerPathSegment) => {
  if (typeof arg === 'string') {
    return arg;
  }

  if (arg instanceof RegExp || typeof arg === 'number') {
    return arg.toString();
  }

  return;
};

export function getConstructedRoute(req: {
  originalUrl: PatchedRequest['originalUrl'];
  [_LAYERS_STORE_PROPERTY]?: string[];
}) {
  const layersStore: string[] = Array.isArray(req[_LAYERS_STORE_PROPERTY])
    ? (req[_LAYERS_STORE_PROPERTY] as string[])
    : [];

  const meaningfulPaths = layersStore.filter(
    path => path !== '/' && path !== '/*'
  );

  if (meaningfulPaths.length === 1 && meaningfulPaths[0] === '*') {
    return '*';
  }

  // Join parts and remove duplicate slashes
  return meaningfulPaths.join('').replace(/\/{2,}/g, '/');
}

/**
 * Extracts the actual matched route from Express request for OpenTelemetry instrumentation.
 * Returns the route that should be used as the http.route attribute.
 *
 * @param req - The Express request object with layers store
 * @param layersStoreProperty - The property name where layer paths are stored
 * @returns The matched route string or undefined if no valid route is found
 */
export function getActualMatchedRoute(req: {
  originalUrl: PatchedRequest['originalUrl'];
  [_LAYERS_STORE_PROPERTY]?: string[];
}): string | undefined {
  const layersStore: string[] = Array.isArray(req[_LAYERS_STORE_PROPERTY])
    ? (req[_LAYERS_STORE_PROPERTY] as string[])
    : [];

  // If no layers are stored, no route can be determined
  if (layersStore.length === 0) {
    return undefined;
  }

  // Handle root path case - if all paths are root, only return root if originalUrl is also root
  // The layer store also includes root paths in case a non-existing url was requested
  if (layersStore.every(path => path === '/')) {
    return req.originalUrl === '/' ? '/' : undefined;
  }

  const constructedRoute = getConstructedRoute(req);
  if (constructedRoute === '*') {
    return constructedRoute;
  }

  // For RegExp routes or route arrays, return the constructed route
  // This handles the case where the route is defined using RegExp or an array
  if (
    constructedRoute.includes('/') &&
    (constructedRoute.includes(',') ||
      constructedRoute.includes('\\') ||
      constructedRoute.includes('*') ||
      constructedRoute.includes('['))
  ) {
    return constructedRoute;
  }

  // Ensure route starts with '/' if it doesn't already
  const normalizedRoute = constructedRoute.startsWith('/')
    ? constructedRoute
    : `/${constructedRoute}`;

  // Validate that this appears to be a matched route
  // A route is considered matched if:
  // 1. We have a constructed route
  // 2. The original URL matches or starts with our route pattern
  const isValidRoute =
    normalizedRoute.length > 0 &&
    (req.originalUrl === normalizedRoute ||
      req.originalUrl.startsWith(normalizedRoute) ||
      isRoutePattern(normalizedRoute));

  return isValidRoute ? normalizedRoute : undefined;
}

/**
 * Checks if a route contains parameter patterns (e.g., :id, :userId)
 * which are valid even if they don't exactly match the original URL
 */
function isRoutePattern(route: string): boolean {
  return route.includes(':') || route.includes('*');
}
