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

import { NormalizedOptions } from './internal-types';
import { NET_TRANSPORT_VALUE_PIPE } from './semconv';
import { platform } from 'os';

// Currently the `IPC_TRANSPORT` values are for 'net.transport'. In semconv
// v1.21.0 a breaking change (https://github.com/open-telemetry/opentelemetry-specification/pull/3426)
// replaced 'net.transport' with 'network.transport'. The deprecated
// 'net.transport' *removed* the 'unix' value (not sure if intentional). As a
// result, the JS `@opentelemetry/semantic-conventions` package does not export
// a `NET_TRANSPORT_VALUE_UNIX`.
//
// (TODO: update instrumentation-net (per PR-3426) to use 'network.transport',
// then the `NETWORK_TRANSPORT_VALUE_UNIX` constant can be used.)
export const IPC_TRANSPORT =
  platform() === 'win32' ? NET_TRANSPORT_VALUE_PIPE : 'unix';

function getHost(args: unknown[]) {
  return typeof args[1] === 'string' ? args[1] : 'localhost';
}

export function getNormalizedArgs(
  args: unknown[]
): NormalizedOptions | null | undefined {
  const opt = args[0];
  if (!opt) {
    return;
  }

  switch (typeof opt) {
    case 'number':
      return {
        port: opt,
        host: getHost(args),
      };
    case 'object':
      if (Array.isArray(opt)) {
        return getNormalizedArgs(opt);
      }
      return opt;
    case 'string': {
      const maybePort = Number(opt);
      if (maybePort >= 0) {
        return {
          port: maybePort,
          host: getHost(args),
        };
      }

      return {
        path: opt,
      };
    }
    default:
      return;
  }
}
