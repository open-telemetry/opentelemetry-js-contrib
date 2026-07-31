/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This file is used to load the instrumentation before running tests.
 * It ensures that the instrumentation is loaded and registered before any
 * other modules are imported.
 */

import { LangChainInstrumentation } from '../src';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

registerInstrumentations({
  instrumentations: [new LangChainInstrumentation()],
});
