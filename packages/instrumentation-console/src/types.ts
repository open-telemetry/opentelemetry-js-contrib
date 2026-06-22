/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SeverityNumber } from '@opentelemetry/api-logs';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface ConsoleInstrumentationConfig extends InstrumentationConfig {
  /**
   * Control minimum severity level for log sending. Logs will be sent for the
   * specified severity and higher.
   * @default SeverityNumber.UNSPECIFIED (send all)
   */
  logSeverity?: SeverityNumber;
}
