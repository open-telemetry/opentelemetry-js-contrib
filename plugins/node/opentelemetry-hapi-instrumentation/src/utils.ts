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
import { HttpAttribute } from '@opentelemetry/semantic-conventions';
import type * as Hapi from '@hapi/hapi';
import {
  AttributeNames,
  HapiLayerType,
  HapiLifecycleMethodNames,
} from './types';

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
    HapiLifecycleMethodNames.includes(variableToCheck)
  );
};

export const getRouteMetadata = (
  route: Hapi.ServerRoute,
  pluginName?: string
): {
  attributes: Attributes;
  name: string;
} => {
  if (pluginName) {
    return {
      attributes: {
        [HttpAttribute.HTTP_ROUTE]: route.path,
        [HttpAttribute.HTTP_METHOD]: route.method,
        [AttributeNames.HAPI_TYPE]: HapiLayerType.PLUGIN,
        [AttributeNames.PLUGIN_NAME]: pluginName,
      },
      name: `${pluginName}: route - ${route.path}`,
    };
  }
  return {
    attributes: {
      [HttpAttribute.HTTP_ROUTE]: route.path,
      [HttpAttribute.HTTP_METHOD]: route.method,
      [AttributeNames.HAPI_TYPE]: HapiLayerType.ROUTER,
    },
    name: `route - ${route.path}`,
  };
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
