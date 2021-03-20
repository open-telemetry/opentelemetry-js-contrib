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

import { NormalizedOptions } from './types';
import { platform } from 'os';

// @TODO Can be replaced with constants from the semantic conventions package once released.
export const IPC_PIPE = 'pipe';
export const IPC_UNIX = 'Unix';
export const IPC_TRANSPORT = platform() === 'win32' ? IPC_PIPE : IPC_UNIX;

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
        host: typeof args[1] === 'string' ? args[1] : 'localhost',
      };
    case 'object':
      if (Array.isArray(opt)) {
        return getNormalizedArgs(opt);
      }
      return opt;
    case 'string':
      return {
        path: opt,
      };
    default:
      return;
  }
}
