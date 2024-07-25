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

import { useMemo } from 'react';

const consoleStub = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  log: (_: string) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  warn: (_: string) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  error: (_: string) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  info: (_: string) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  trace: (_: string) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  debug: (_: string) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  table: () => {},
  groupEnd: () => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  group: (_?: string) => {},
};

const useConsole = (debug: boolean) =>
  useMemo(() => {
    if (debug) {
      return console;
    }

    return consoleStub;
  }, [debug]);

export default useConsole;
