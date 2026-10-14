/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, SeverityNumber, logs } from '@opentelemetry/api-logs';
import TransportStream = require('winston-transport');
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { emitLogRecord } from './utils';

export interface OpenTelemetryTransportV3Options
  extends TransportStream.TransportStreamOptions {
  /**
   * Custom mapping of winston log level names to OpenTelemetry SeverityNumber.
   */
  severityMapping?: Record<string, SeverityNumber>;
  /**
   * Minimum OpenTelemetry severity level to emit.
   */
  logSeverity?: SeverityNumber;
}

export class OpenTelemetryTransportV3 extends TransportStream {
  private _logger: Logger;
  private _severityMapping?: Record<string, SeverityNumber>;
  private _logSeverity?: SeverityNumber;

  constructor(options?: OpenTelemetryTransportV3Options) {
    super(options);
    this._logger = logs.getLogger(PACKAGE_NAME, PACKAGE_VERSION);
    this._severityMapping = options?.severityMapping;
    this._logSeverity = options?.logSeverity;
  }

  public override log(info: any, callback: () => void) {
    try {
      emitLogRecord(
        info,
        this._logger,
        this._severityMapping,
        this._logSeverity
      );
    } catch (error) {
      this.emit('warn', error);
    }
    this.emit('logged', info);
    if (callback) {
      callback();
    }
  }
}
