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

import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import type * as Pulsar from 'pulsar-client';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { InstrumentationConfig } from './types';
import { VERSION } from './version';
import { ClientProxy } from './proxies/client';

type PulsarConstructor = new (config: Pulsar.ClientConfig) => Pulsar.Client;

export class Instrumentation extends InstrumentationBase<typeof Pulsar.Client> {
  static readonly COMPONENT = 'pulsar';
  static readonly COMMON_ATTRIBUTES = {
    [SemanticAttributes.MESSAGING_SYSTEM]: 'pulsar',
  };
  static readonly DEFAULT_CONFIG: InstrumentationConfig = {
    enhancedDatabaseReporting: false,
  };

  constructor(config: InstrumentationConfig = {}) {
    super(
      '@opentelemetry/instrumentation-pulsar-client',
      VERSION,
      Object.assign({}, Instrumentation.DEFAULT_CONFIG, config)
    );
  }

  override setConfig(config: InstrumentationConfig = {}) {
    this._config = Object.assign({}, Instrumentation.DEFAULT_CONFIG, config);
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition<typeof Pulsar>(
        'pulsar-client',
        ['>=1.0'],
        (moduleExports, moduleVersion) => {
          this._diag.debug(
            `Patching ${Instrumentation.COMPONENT}@${moduleVersion}`
          );
          this.ensureWrapped(
            moduleVersion,
            moduleExports,
            'Client',
            this.wrapClient.bind(this, moduleVersion)
          );
          return moduleExports;
        },
        (moduleExports, moduleVersion) => {
          this._diag.debug(
            `Unpatching ${Instrumentation.COMPONENT}@${moduleVersion}`
          );
          if (moduleExports === undefined) return;

          this._unwrap(moduleExports, 'Client');
        }
      ),
    ];
  }

  wrapClient(moduleVersion: undefined | string, original: PulsarConstructor) {
    const tracer = this.tracer;
    return function (config: Pulsar.ClientConfig) {
      return new ClientProxy(tracer, moduleVersion, new original(config));
    };
  }

  private ensureWrapped(
    moduleVersion: string | undefined,
    obj: Pulsar.Client,
    methodName: string,
    wrapper: PulsarConstructor
  ) {
    this._diag.debug(
      `Applying ${methodName} patch for ${Instrumentation.COMPONENT}@${moduleVersion}`
    );
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(obj, methodName, wrapper);
  }
}
