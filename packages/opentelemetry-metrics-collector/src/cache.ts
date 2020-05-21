/*!
 * Copyright 2020, OpenTelemetry Authors
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

import { CacheItem } from './types';

const cache: { [key: string]: CacheItem } = {};

const CACHE_VALID_MS = 10;

/**
 * This is used due to some limitation for example the observer cannot set many
 * values at the same time, but has to call then one by one
 * @param name
 * @param callback
 */
export function getFromCache(name: string, callback: () => any): any {
  let item = cache[name];
  const now = new Date().getTime();
  if (item && now - item.timestamp < CACHE_VALID_MS) {
    return item.data;
  }
  cache[name] = {
    timestamp: new Date().getTime(),
    data: callback(),
  };
  return cache[name].data;
}
