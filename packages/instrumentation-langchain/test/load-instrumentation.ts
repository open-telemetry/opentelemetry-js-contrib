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

process.env.LANGSMITH_TRACING = 'false';
process.env.LANGCHAIN_TRACING_V2 = 'false';
process.env.LANGCHAIN_TRACING = 'false';

export const instrumentation = new LangChainInstrumentation();
registerInstrumentations({ instrumentations: [instrumentation] });
