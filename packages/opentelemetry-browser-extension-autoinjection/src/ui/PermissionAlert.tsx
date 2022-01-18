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
import { PermissionAlertProps } from '../types';
import { Alert } from '@material-ui/lab';
import { Link } from '@material-ui/core';

export class PermissionAlert extends React.Component<PermissionAlertProps> {
  override render() {
    const origins = this.props.permissions.origins ?? [];

    const accessToAllUrlsGranted =
      origins.includes('<all_urls>') ||
      (origins.includes('http://*/*') && origins.includes('https://*/*'));

    if (this.props.dismissed || accessToAllUrlsGranted) {
      return '';
    }
    return (
      <Alert severity="warning">
        Without the permission to access all websites, you need to click on the
        extension icon once every time you open a new tab.{' '}
        <Link onClick={this.props.onGrantPermission}>Click here</Link> to grant
        access or <Link onClick={this.props.onDismiss}>dismiss</Link> this
        warning.
      </Alert>
    );
  }
}
