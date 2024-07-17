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
export interface INavigationContainer {
  addListener: (
    event: 'state',
    callback: (args: { name: string }) => void
  ) => void;
  getCurrentRoute: () => { name: string };
}

export interface INativeNavigationContainer {
  registerComponentDidAppearListener: (
    cb: (args: { componentName: string }) => void
  ) => void;
  registerComponentDidDisappearListener: (
    cb: (args: { componentName: string }) => void
  ) => void;
}
