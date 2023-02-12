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

import { LookupAddress } from 'dns';
import { diag, Span, SpanKind } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import * as semver from 'semver';
import { AddressFamily } from './enums/AddressFamily';
import { DnsInstrumentationConfig } from './types';
import * as utils from './utils';
import { VERSION } from './version';
import {
  Dns,
  LookupCallbackSignature,
  LookupPromiseSignature,
} from './internal-types';

/**
 * Dns instrumentation for Opentelemetry
 */
export class DnsInstrumentation extends InstrumentationBase<Dns> {
  constructor(protected override _config: DnsInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-dns', VERSION, _config);
  }

  init(): InstrumentationNodeModuleDefinition<Dns>[] {
    return [
      new InstrumentationNodeModuleDefinition<Dns>(
        'dns',
        ['*'],
        moduleExports => {
          diag.debug('Applying patch for dns');
          if (isWrapped(moduleExports.lookup)) {
            this._unwrap(moduleExports, 'lookup');
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this._wrap(moduleExports, 'lookup', this._getLookup() as any);
          // new promise methods in node >= 10.6.0
          // https://nodejs.org/docs/latest/api/dns.html#dns_dnspromises_lookup_hostname_options
          if (semver.gte(process.version, '10.6.0')) {
            this._wrap(
              moduleExports.promises,
              'lookup',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              this._getLookup() as any
            );
          }
          return moduleExports;
        },
        moduleExports => {
          if (moduleExports === undefined) return;
          diag.debug('Removing patch for dns');
          this._unwrap(moduleExports, 'lookup');
          if (semver.gte(process.version, '10.6.0')) {
            this._unwrap(moduleExports.promises, 'lookup');
          }
        }
      ),
    ];
  }

  /**
   * Get the patched lookup function
   */
  private _getLookup() {
    return (original: (hostname: string, ...args: unknown[]) => void) => {
      return this._getPatchLookupFunction(original);
    };
  }

  /**
   * Creates spans for lookup operations, restoring spans' context if applied.
   */
  private _getPatchLookupFunction(
    original: (hostname: string, ...args: unknown[]) => void
  ) {
    diag.debug('patch lookup function');
    const plugin = this;
    return function patchedLookup(
      this: {},
      hostname: string,
      ...args: unknown[]
    ) {
      if (
        utils.isIgnored(hostname, plugin._config.ignoreHostnames, (e: Error) =>
          diag.error('caught ignoreHostname error: ', e)
        )
      ) {
        return original.apply(this, [hostname, ...args]);
      }

      const argsCount = args.length;
      diag.debug('wrap lookup callback function and starts span');
      const name = utils.getOperationName('lookup');
      const span = plugin.tracer.startSpan(name, {
        kind: SpanKind.CLIENT,
      });

      const originalCallback = args[argsCount - 1];
      if (typeof originalCallback === 'function') {
        args[argsCount - 1] = plugin._wrapLookupCallback(
          originalCallback,
          span
        );
        return safeExecuteInTheMiddle(
          () => original.apply(this, [hostname, ...args]),
          error => {
            if (error != null) {
              utils.setError(error, span, process.version);
              span.end();
            }
          }
        );
      } else {
        const promise = safeExecuteInTheMiddle(
          () =>
            (original as LookupPromiseSignature).apply(this, [
              hostname,
              ...args,
            ]),
          error => {
            if (error != null) {
              utils.setError(error, span, process.version);
              span.end();
            }
          }
        );
        promise.then(
          result => {
            utils.setLookupAttributes(span, result as LookupAddress);
            span.end();
          },
          (e: NodeJS.ErrnoException) => {
            utils.setError(e, span, process.version);
            span.end();
          }
        );

        return promise;
      }
    };
  }

  /**
   * Wrap lookup callback function
   */
  private _wrapLookupCallback(
    original: Function,
    span: Span
  ): LookupCallbackSignature {
    return function wrappedLookupCallback(
      this: {},
      err: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: AddressFamily
    ): void {
      diag.debug('executing wrapped lookup callback function');

      if (err !== null) {
        utils.setError(err, span, process.version);
      } else {
        utils.setLookupAttributes(span, address, family);
      }

      span.end();
      diag.debug('executing original lookup callback function');
      return original.apply(this, arguments);
    };
  }
}
