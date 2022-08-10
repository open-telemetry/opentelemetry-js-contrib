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

import { TabStatus, CONTENT_SCRIPT_NAME } from '../types';

export class ProgrammaticContentScriptInjector {
  scope: typeof chrome;

  constructor(scope: typeof chrome) {
    this.scope = scope;
  }

  injectContentScript(tabId: number) {
    this.scope.tabs.get(tabId, (tab: chrome.tabs.Tab) => {
      if (tab.url) {
        if (this.scope.scripting) {
          this.scope.scripting.executeScript({
            target: {
              allFrames: true,
              tabId,
            },
            files: [CONTENT_SCRIPT_NAME],
          });
        } else {
          this.scope.tabs.executeScript(tabId, {
            file: CONTENT_SCRIPT_NAME,
            allFrames: true,
          });
        }
      }
    });
  }

  register() {
    this.scope.tabs.onUpdated.addListener(
      (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (changeInfo.status === TabStatus.LOADING) {
          this.injectContentScript(tabId);
        }
      }
    );
  }
}
