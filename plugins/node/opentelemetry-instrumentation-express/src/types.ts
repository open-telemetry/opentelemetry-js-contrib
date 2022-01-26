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

import { kLayerPatched } from './';
import { Request } from 'express';
import { SpanAttributes } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { ExpressLayerType } from './enums/ExpressLayerType';

/**
 * This const define where on the `request` object the Instrumentation will mount the
 * current stack of express layer.
 *
 * It is necessary because express doesnt store the different layers
 * (ie: middleware, router etc) that it called to get to the current layer.
 * Given that, the only way to know the route of a given layer is to
 * store the path of where each previous layer has been mounted.
 *
 * ex: bodyParser > auth middleware > /users router > get /:id
 *  in this case the stack would be: ["/users", "/:id"]
 *
 * ex2: bodyParser > /api router > /v1 router > /users router > get /:id
 *  stack: ["/api", "/v1", "/users", ":id"]
 *
 */
export const _LAYERS_STORE_PROPERTY = '__ot_middlewares';

export type PatchedRequest = {
  [_LAYERS_STORE_PROPERTY]?: string[];
} & Request;
export type PathParams = string | RegExp | Array<string | RegExp>;

// https://github.com/expressjs/express/blob/main/lib/router/index.js#L53
export type ExpressRouter = {
  params: { [key: string]: string };
  _params: string[];
  caseSensitive: boolean;
  mergeParams: boolean;
  strict: boolean;
  stack: ExpressLayer[];
};

// https://github.com/expressjs/express/blob/main/lib/router/layer.js#L33
export type ExpressLayer = {
  handle: Function;
  [kLayerPatched]?: boolean;
  name: string;
  params: { [key: string]: string };
  path: string;
  regexp: RegExp;
};

export type LayerMetadata = {
  attributes: SpanAttributes;
  name: string;
};

export type IgnoreMatcher = string | RegExp | ((name: string) => boolean);

export type ExpressRequestInfo = {
  request: Request;
  route: string;
  /**
   * If layerType is undefined, SpanNameHook is being invoked to rename the original root HTTP span.
   */
  layerType?: ExpressLayerType;
};

export type SpanNameHook = (
  info: ExpressRequestInfo,
  /**
   * If no decision is taken based on RequestInfo, the default name
   * supplied by the instrumentation can be used instead.
   */
  defaultName: string
) => string;

/**
 * Options available for the Express Instrumentation (see [documentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-Instrumentation-express#express-Instrumentation-options))
 */
export interface ExpressInstrumentationConfig extends InstrumentationConfig {
  /** Ignore specific based on their name */
  ignoreLayers?: IgnoreMatcher[];
  /** Ignore specific layers based on their type */
  ignoreLayersType?: ExpressLayerType[];
  spanNameHook?: SpanNameHook;
}
