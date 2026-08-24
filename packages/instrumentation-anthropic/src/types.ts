/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { GenAIInstrumentationConfig } from '@opentelemetry/genai-util';

export type AnthropicInstrumentationConfig = InstrumentationConfig &
  GenAIInstrumentationConfig;
