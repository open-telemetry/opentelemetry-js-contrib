/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { BaseOpenTelemetryComponent } from '../../src';

export default class AllLifecycles extends BaseOpenTelemetryComponent {
  constructor(props: Readonly<any>) {
    super(props);
  }

  override componentDidMount() {}

  override componentDidUpdate(prevProps: any) {}

  override shouldComponentUpdate(nextProps: any, nextState: any) {
    return true;
  }

  override getSnapshotBeforeUpdate(prevProps: any, prevState: any) {
    return null;
  }

  override render() {
    return <div></div>;
  }
}
