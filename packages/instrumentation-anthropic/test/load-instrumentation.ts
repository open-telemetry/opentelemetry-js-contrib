/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';
import { AnthropicInstrumentation } from '../src';

export const instrumentation = new AnthropicInstrumentation();
registerInstrumentationTesting(instrumentation);
instrumentation.disable();
