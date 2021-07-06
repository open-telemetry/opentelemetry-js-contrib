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
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { AppType } from '../types';
import { styles } from './styles';
import { withStyles } from '@material-ui/core';
import { loadFromStorage } from '../utils/storage';
import { App } from './App';

loadFromStorage()
  .then(async storage => {
    const app = window.location.pathname.startsWith('/options.html')
      ? AppType.OPTIONS
      : AppType.POPUP;

    let activeTab: chrome.tabs.Tab | undefined;

    if (app === AppType.POPUP) {
      const tabs = await new Promise<chrome.tabs.Tab[]>(resolve => {
        chrome.tabs.query(
          {
            active: true,
            lastFocusedWindow: true,
          },
          result => {
            resolve(result);
          }
        );
      });
      activeTab = tabs[0];
    }

    const permissions = await new Promise<chrome.permissions.Permissions>(
      resolve => {
        chrome.permissions.getAll(permissions => resolve(permissions));
      }
    );

    const StyledApp = withStyles(styles)(App);

    ReactDOM.render(
      <StyledApp
        settings={storage.settings}
        isPermissionAlertDismissed={storage.isPermissionAlertDismissed}
        app={app}
        activeTab={activeTab}
        permissions={permissions}
      />,
      document.getElementById('root')
    );
  })
  .catch(error => {
    // eslint-disable-next-line no-console
    console.error(error);
  });
