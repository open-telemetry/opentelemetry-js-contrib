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
import { NetTransportValues } from '@opentelemetry/semantic-conventions';
import { platform } from 'os';

export const IPC_TRANSPORT =
  platform() === 'win32' ? NetTransportValues.PIPE : NetTransportValues.UNIX;

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
