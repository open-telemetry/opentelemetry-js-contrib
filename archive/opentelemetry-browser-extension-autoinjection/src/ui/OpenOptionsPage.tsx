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

import { Link } from '@material-ui/core';
import { Launch } from '@material-ui/icons';
import * as React from 'react';

export class OpenOptionsPage extends React.Component {
  constructor(props: {}) {
    super(props);
    this.openOptionsPage = this.openOptionsPage.bind(this);
  }

  openOptionsPage(event: React.MouseEvent) {
    event.preventDefault();
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  }

  override render() {
    return (
      <Link href="#" onClick={this.openOptionsPage}>
        <Launch></Launch>
      </Link>
    );
  }
}
