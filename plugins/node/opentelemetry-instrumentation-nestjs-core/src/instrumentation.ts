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

import * as api from '@opentelemetry/api';
import {
  isWrapped,
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import type * as NestJS from '@nestjs/core';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
// import * as utils from './utils';
import { InstrumentationConfig } from './types';
import { VERSION } from './version';

export class Instrumentation extends InstrumentationBase<typeof NestJS> {
  static readonly COMPONENT = '@nestjs/core';
  static readonly COMMON_ATTRIBUTES = {
    [SemanticAttributes.DB_SYSTEM]: Instrumentation.COMPONENT,
  };
  static readonly DEFAULT_CONFIG: InstrumentationConfig = {
    collectCommand: false,
  };

  constructor(config: InstrumentationConfig = Instrumentation.DEFAULT_CONFIG) {
    super(
      '@opentelemetry/instrumentation-nestjs-core',
      VERSION,
      Object.assign({}, Instrumentation.DEFAULT_CONFIG, config)
    );
  }

  setConfig(config: InstrumentationConfig = Instrumentation.DEFAULT_CONFIG) {
    this._config = Object.assign({}, Instrumentation.DEFAULT_CONFIG, config);
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition<typeof NestJS>(
        '@nestjs/core',
        ['>=2.2'],
        (moduleExports, moduleVersion) => {
          console.debug(
            `Patching ${Instrumentation.COMPONENT}@${moduleVersion}`
          );
          // this.ensureWrapped(
          //   moduleVersion,
          //   moduleExports.prototype,
          //   'command',
          // );
          return moduleExports;
        },
        (moduleExports, moduleVersion) => {
          console.debug(
            `Unpatching ${Instrumentation.COMPONENT}@${moduleVersion}`
          );
          if (moduleExports === undefined) return;
          // `command` is documented API missing from the types
          // this._unwrap(moduleExports.prototype, 'command' as keyof Memcached);
        }
      ),
    ];
  }

  private ensureWrapped(
    moduleVersion: string | undefined,
    obj: any,
    methodName: string,
    wrapper: (original: any) => any
  ) {
    console.debug(
      `Applying ${methodName} patch for ${Instrumentation.COMPONENT}@${moduleVersion}`
    );
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(obj, methodName, wrapper);
  }
}
