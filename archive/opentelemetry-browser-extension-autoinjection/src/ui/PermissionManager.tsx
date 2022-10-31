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

import {
  Grid,
  FormGroup,
  FormControlLabel,
  Switch,
  FormHelperText,
  Link,
} from '@material-ui/core';
import * as React from 'react';
import { PermissionManagerProps } from '../types';
import { Alert } from '@material-ui/lab';

export class PermissionManager extends React.Component<PermissionManagerProps> {
  override render() {
    const origins = this.props.permissions.origins ?? [];

    const accessToAllUrlsGranted =
      origins.includes('<all_urls>') ||
      (origins.includes('http://*/*') && origins.includes('https://*/*'));

    return (
      <React.Fragment>
        <Grid item xs={12} md={12}>
          {this.props.removingPermissionsFailed ? (
            <Alert severity="error">
              Permissions can not be revoked. Go to chrome://extensions, open
              the details of this extension and revoke them manually.
            </Alert>
          ) : (
            ''
          )}
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  checked={accessToAllUrlsGranted}
                  onChange={() =>
                    this.props.onTogglePermissions(accessToAllUrlsGranted)
                  }
                ></Switch>
              }
              label="Access all websites"
            />
            <FormHelperText>
              Toggle to have injection work immediately on opening a new tab.
              Otherwise, you need to click the extension icon once to active it.{' '}
              (
              <Link
                href="https://developer.chrome.com/extensions/permission_warnings"
                target="_blank"
                rel="noopener noreferrer"
              >
                Learn More
              </Link>
              )
            </FormHelperText>
          </FormGroup>
        </Grid>
      </React.Fragment>
    );
  }
}
