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
  ATTR_HTTP_ROUTE,
  ATTR_HTTP_REQUEST_METHOD,
} from '@opentelemetry/semantic-conventions';
import { ATTR_HTTP_METHOD } from './semconv';
import type * as Hapi from '@hapi/hapi';
import {
  HapiLayerType,
  HapiLifecycleMethodNames,
  HapiPluginObject,
  PatchableExtMethod,
  ServerExtDirectInput,
} from './internal-types';
import { AttributeNames } from './enums/AttributeNames';
import { SemconvStability } from '@opentelemetry/instrumentation';

export function getPluginName<T>(plugin: Hapi.Plugin<T>): string {
  if ((plugin as Hapi.PluginNameVersion).name) {
    return (plugin as Hapi.PluginNameVersion).name;
  } else {
    return (plugin as Hapi.PluginPackage).pkg.name;
  }
}

export const isLifecycleExtType = (
  variableToCheck: unknown
): variableToCheck is Hapi.ServerRequestExtType => {
  return (
    typeof variableToCheck === 'string' &&
    HapiLifecycleMethodNames.has(variableToCheck)
  );
};

export const isLifecycleExtEventObj = (
  variableToCheck: unknown
): variableToCheck is Hapi.ServerExtEventsRequestObject => {
  const event = (variableToCheck as Hapi.ServerExtEventsRequestObject)?.type;
  return event !== undefined && isLifecycleExtType(event);
};

export const isDirectExtInput = (
  variableToCheck: unknown
): variableToCheck is ServerExtDirectInput => {
  return (
    Array.isArray(variableToCheck) &&
    variableToCheck.length <= 3 &&
    isLifecycleExtType(variableToCheck[0]) &&
    typeof variableToCheck[1] === 'function'
  );
};

export const isPatchableExtMethod = (
  variableToCheck: PatchableExtMethod | PatchableExtMethod[]
): variableToCheck is PatchableExtMethod => {
  return !Array.isArray(variableToCheck);
};

export const getRouteMetadata = (
  route: Hapi.ServerRoute,
  semconvStability: SemconvStability,
  pluginName?: string
): {
  attributes: Attributes;
  name: string;
} => {
  const attributes: Attributes = {
    [ATTR_HTTP_ROUTE]: route.path,
  };
  if (semconvStability & SemconvStability.OLD) {
    attributes[ATTR_HTTP_METHOD] = route.method;
  }
  if (semconvStability & SemconvStability.STABLE) {
    // Note: This currently does *not* normalize the method name to uppercase
    // and conditionally include `http.request.method.original` as described
    // at https://opentelemetry.io/docs/specs/semconv/http/http-spans/
    // These attributes are for a *hapi* span, and not the parent HTTP span,
    // so the HTTP span guidance doesn't strictly apply.
    attributes[ATTR_HTTP_REQUEST_METHOD] = route.method;
  }

  let name;
  if (pluginName) {
    attributes[AttributeNames.HAPI_TYPE] = HapiLayerType.PLUGIN;
    attributes[AttributeNames.PLUGIN_NAME] = pluginName;
    name = `${pluginName}: route - ${route.path}`;
  } else {
    attributes[AttributeNames.HAPI_TYPE] = HapiLayerType.ROUTER;
    name = `route - ${route.path}`;
  }

  return { attributes, name };
};

export const getExtMetadata = (
  extPoint: Hapi.ServerRequestExtType,
  pluginName?: string
): {
  attributes: Attributes;
  name: string;
} => {
  if (pluginName) {
    return {
      attributes: {
        [AttributeNames.EXT_TYPE]: extPoint,
        [AttributeNames.HAPI_TYPE]: HapiLayerType.EXT,
        [AttributeNames.PLUGIN_NAME]: pluginName,
      },
      name: `${pluginName}: ext - ${extPoint}`,
    };
  }
  return {
    attributes: {
      [AttributeNames.EXT_TYPE]: extPoint,
      [AttributeNames.HAPI_TYPE]: HapiLayerType.EXT,
    },
    name: `ext - ${extPoint}`,
  };
};

export const getPluginFromInput = <T>(
  pluginObj: HapiPluginObject<T>
): Hapi.Plugin<T, void> => {
  if ('plugin' in pluginObj) {
    if ('plugin' in pluginObj.plugin) {
      return pluginObj.plugin.plugin;
    }
    return pluginObj.plugin;
  }
  return pluginObj;
};
