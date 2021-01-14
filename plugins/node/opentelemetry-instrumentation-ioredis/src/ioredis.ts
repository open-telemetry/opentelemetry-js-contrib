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

import type * as ioredisTypes from 'ioredis';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { IORedisInstrumentationConfig } from './types';
import { traceConnection, traceSendCommand } from './utils';
import { VERSION } from './version';

export class IORedisInstrumentation extends InstrumentationBase<
  typeof ioredisTypes
> {
  static readonly DB_SYSTEM = 'redis';
  readonly supportedVersions = ['>1 <5'];

  constructor(protected _config: IORedisInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-ioredis', VERSION, _config);
  }

  init(): InstrumentationNodeModuleDefinition<typeof ioredisTypes>[] {
    return [
      new InstrumentationNodeModuleDefinition<typeof ioredisTypes>(
        'ioredis',
        this.supportedVersions,
        moduleExports => {
          this._logger.debug('Applying patch for ioredis');
          if (isWrapped(moduleExports.prototype.sendCommand)) {
            this._unwrap(moduleExports.prototype, 'sendCommand');
          }
          this._wrap(
            moduleExports.prototype,
            'sendCommand',
            this._patchSendCommand()
          );
          if (isWrapped(moduleExports.prototype.connect)) {
            this._unwrap(moduleExports.prototype, 'connect');
          }
          this._wrap(
            moduleExports.prototype,
            'connect',
            this._patchConnection()
          );
          return moduleExports;
        },
        moduleExports => {
          if (moduleExports === undefined) return;
          this._logger.debug('Removing patch for ioredis');
          this._unwrap(moduleExports.prototype, 'sendCommand');
          this._unwrap(moduleExports.prototype, 'connect');
        }
      ),
    ];
  }

  /**
   * Patch send command internal to trace requests
   */
  private _patchSendCommand() {
    return (original: Function) => {
      return traceSendCommand(this.tracer, original, this._config);
    };
  }

  private _patchConnection() {
    return (original: Function) => {
      return traceConnection(this.tracer, original);
    };
  }
}
