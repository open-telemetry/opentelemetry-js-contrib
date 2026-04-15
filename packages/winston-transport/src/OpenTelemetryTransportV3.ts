/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, logs } from '@opentelemetry/api-logs';
import TransportStream = require('winston-transport');
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { emitLogRecord } from './utils';

export class OpenTelemetryTransportV3 extends TransportStream {
  private _logger: Logger;

  constructor(options?: TransportStream.TransportStreamOptions) {
    super(options);
    this._logger = logs.getLogger(PACKAGE_NAME, PACKAGE_VERSION);
  }

  public override log(info: any, callback: () => void) {
    try {
      emitLogRecord(info, this._logger);
    } catch (error) {
      this.emit('warn', error);
    }
    this.emit('logged', info);
    if (callback) {
      callback();
    }
  }
}
