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

import { diag } from '@opentelemetry/api';
import {
  isWrapped,
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import type * as redisTypes from 'redis';
import {
  getTracedCreateClient,
  getTracedCreateStreamTrace,
  getTracedInternalSendCommand,
} from './utils';
import { RedisInstrumentationConfig } from './types';
import { VERSION } from './version';

const DEFAULT_CONFIG: RedisInstrumentationConfig = {
  requireParentSpan: false,
};

export class RedisInstrumentation extends InstrumentationBase<
  typeof redisTypes
> {
  static readonly COMPONENT = 'redis';

  constructor(protected override _config: RedisInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-redis', VERSION, _config);
  }

  override setConfig(config: RedisInstrumentationConfig = {}) {
    this._config = Object.assign({}, DEFAULT_CONFIG, config);
  }

  protected init() {
    return [

      // @node-redis/client is a new package introduced and consumed by 'redis ^4.0.0'
      new InstrumentationNodeModuleDefinition<unknown>(
        '@node-redis/client',
        ['^1.0.0'],
        () => {},
        () => {},
        [ new InstrumentationNodeModuleFile<any>(
          '@node-redis/client/dist/lib/client/commands-queue.js',
          ['^1.0.0'],
          (moduleExports: any, moduleVersion?: string) => {
            const commandsQueuePrototype = moduleExports.default.prototype;
            if (
              isWrapped(
                commandsQueuePrototype?.addCommand
              )
            ) {
              this._unwrap(
                commandsQueuePrototype,
                'addCommand'
              );
            }
            this._wrap(
              commandsQueuePrototype,
              'addCommand',
              this._getPatchAddCommandV4()
            );
  

            console.log(moduleExports.default.prototype['addCommand']);
          },
          (moduleExports: unknown, moduleVersion?: string) => {
            
          },
        )]
      ),

      new InstrumentationNodeModuleDefinition<typeof redisTypes>(
        'redis',
        ['^2.6.0', '^3.0.0'],
        (moduleExports, moduleVersion) => {
          diag.debug(`Patching redis@${moduleVersion}`);
          diag.debug('Patching redis.RedisClient.internal_send_command');
          if (
            isWrapped(
              moduleExports.RedisClient.prototype['internal_send_command']
            )
          ) {
            this._unwrap(
              moduleExports.RedisClient.prototype,
              'internal_send_command'
            );
          }
          this._wrap(
            moduleExports.RedisClient.prototype,
            'internal_send_command',
            this._getPatchInternalSendCommandV2V3()
          );

          diag.debug('patching redis.RedisClient.create_stream');
          if (isWrapped(moduleExports.RedisClient.prototype['create_stream'])) {
            this._unwrap(moduleExports.RedisClient.prototype, 'create_stream');
          }
          this._wrap(
            moduleExports.RedisClient.prototype,
            'create_stream',
            this._getPatchCreateStream()
          );

          diag.debug('patching redis.createClient');
          if (isWrapped(moduleExports.createClient)) {
            this._unwrap(moduleExports, 'createClient');
          }
          this._wrap(
            moduleExports,
            'createClient',
            this._getPatchCreateClient()
          );
          return moduleExports;
        },
        moduleExports => {
          if (moduleExports === undefined) return;
          this._unwrap(
            moduleExports.RedisClient.prototype,
            'internal_send_command'
          );
          this._unwrap(moduleExports.RedisClient.prototype, 'create_stream');
          this._unwrap(moduleExports, 'createClient');
        }
      ),
    ];
  }

  private _getPatchAddCommandV4() {
    return function addCommandPatchWrapper(original: Function) {
      return function addCommandPatch() {
        console.log('here )))))))))))))))))))))))))');
        return original.apply(this, arguments);
      }
    }
  }

  /**
   * Patch internal_send_command(...) to trace requests
   * This is for v2 and v3 only
   */
  private _getPatchInternalSendCommandV2V3() {
    const tracer = this.tracer;
    const config = this._config;
    return function internal_send_command(original: Function) {
      return getTracedInternalSendCommand(tracer, original, config);
    };
  }

  private _getPatchCreateClient() {
    const tracer = this.tracer;
    return function createClient(original: Function) {
      return getTracedCreateClient(tracer, original);
    };
  }

  private _getPatchCreateStream() {
    const tracer = this.tracer;
    return function createReadStream(original: Function) {
      return getTracedCreateStreamTrace(tracer, original);
    };
  }
}
