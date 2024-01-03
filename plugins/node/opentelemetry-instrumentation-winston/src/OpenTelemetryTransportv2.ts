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

import { Logger, logs } from '@opentelemetry/api-logs';
import * as winston from 'winston2';
import { VERSION } from './version';
import { emitLogRecord } from './utils';

export class OpenTelemetryTransportv2 extends winston.Transport {
  private _logger: Logger;

  constructor(options?: winston.TransportOptions) {
    super(options);
    this._logger = logs.getLogger(
      '@opentelemetry/instrumentation-winston',
      VERSION
    );
  }

  log(level: string, msg: string, meta: any, callback: Function) {
    try {
      const logRecord: Record<string, any> = {
        level: level,
        msg: msg,
        meta: meta,
      };
      emitLogRecord(logRecord, this._logger);
      this.emit('logged');
    } catch (error) {
      this.emit('warn', error);
    }
    if (callback) {
      callback(null, true);
    }
  }
}
