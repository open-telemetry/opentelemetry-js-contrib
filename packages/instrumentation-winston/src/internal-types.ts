/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Logger as Winston3Logger } from 'winston';
import type {
  LoggerInstance as Winston2Logger,
  LogMethod as Winston2LogMethod,
} from 'winston2';
export type Winston3LogMethod = Winston3Logger['write'];
export type Winston3ConfigureMethod = Winston3Logger['configure'];
export type { Winston3Logger };
export type { Winston2LogMethod };
export type Winston2LoggerModule = {
  Logger: Winston2Logger & {
    prototype: { log: Winston2LogMethod };
  };
};
export type { Winston2Logger };
