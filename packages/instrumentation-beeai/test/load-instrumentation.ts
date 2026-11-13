/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { BeeAIInstrumentation } from '../src';

export const instrumentation = new BeeAIInstrumentation();
registerInstrumentations({
  instrumentations: [instrumentation],
});
