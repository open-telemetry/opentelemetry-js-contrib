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

export function ObjectKeys<T>(t: T) {
  return Object.keys(t) as (keyof T)[];
}

export function throttle<T>(fn: () => T, ms: number): () => T {
  let memoized: T | undefined = undefined;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timeout !== null) {
      return memoized!;
    }
    memoized = fn();
    timeout = setTimeout(() => {
      timeout = null;
    }, ms);
    return memoized;
  };
}
