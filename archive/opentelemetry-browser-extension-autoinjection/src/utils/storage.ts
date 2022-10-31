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

import { ExporterType, Storage } from '../types';

export function loadFromStorage(): Promise<Storage> {
  return new Promise<Storage>(resolve => {
    chrome.storage.local.get(
      {
        isPermissionAlertDismissed: false,
        settings: {
          urlFilter: '',
          exporters: {
            [ExporterType.CONSOLE]: {
              enabled: true,
            },
            [ExporterType.ZIPKIN]: {
              enabled: false,
              url: '',
            },
            [ExporterType.COLLECTOR_TRACE]: {
              enabled: false,
              url: '',
            },
          },
        },
      },
      storage => resolve(new Storage(storage))
    );
  });
}
