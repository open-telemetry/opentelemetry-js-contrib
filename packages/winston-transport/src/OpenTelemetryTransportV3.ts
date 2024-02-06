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
import * as Transport from 'winston-transport';
import { VERSION } from './version';
import { emitLogRecord } from './utils';

export class OpenTelemetryTransportV3 extends Transport {
  private _logger: Logger;

  constructor(options?: Transport.TransportStreamOptions) {
    super(options);
    this._logger = logs.getLogger('@opentelemetry/winston', VERSION);
  }

  public override log(info: any, next: () => void) {
    try {
      emitLogRecord(info, this._logger);
    } catch (error) {
      this.emit('warn', error);
    }
    setImmediate(() => {
      this.emit('logged', info);
    });
    if (next) {
      setImmediate(next);
    }
  }
}
