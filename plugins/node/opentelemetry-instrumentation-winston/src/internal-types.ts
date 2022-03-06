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

import type { Logger as Winston3Logger } from 'winston';
import type {
  LoggerInstance as Winston2Logger,
  LogMethod as Winston2LogMethod,
} from 'winston2';
export type Winston3LogMethod = Winston3Logger['write'];
export type { Winston3Logger };

export type { Winston2LogMethod };
export type Winston2LoggerModule = {
  Logger: Winston2Logger & { prototype: { log: Winston2LogMethod } };
};
export type { Winston2Logger };
