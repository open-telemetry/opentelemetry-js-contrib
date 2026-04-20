/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { BaseOpenTelemetryComponent } from '../../src';

export default class MissingComponentDidUpdate extends BaseOpenTelemetryComponent {
  constructor(props: Readonly<any>) {
    super(props);
  }

  override componentDidMount() {}

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
