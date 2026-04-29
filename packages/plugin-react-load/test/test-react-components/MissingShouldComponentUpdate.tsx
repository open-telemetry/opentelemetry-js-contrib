/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { BaseOpenTelemetryComponent } from '../../src';

export default class MisingShouldComponentUpdate extends BaseOpenTelemetryComponent {
  constructor(props: Readonly<any>) {
    super(props);
  }

  override componentDidMount() {}

  override componentDidUpdate(prevProps: any) {}

  override getSnapshotBeforeUpdate(prevProps: any, prevState: any) {
    return null;
  }

  override render() {
    return <div></div>;
  }
}
