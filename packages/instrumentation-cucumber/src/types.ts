/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export type CucumberInstrumentationConfig = InstrumentationConfig;

export enum AttributeNames {
  FEATURE_TAGS = 'cucumber.feature.tags',
  FEATURE_LANGUAGE = 'cucumber.feature.language',
  FEATURE_DESCRIPTION = 'cucumber.feature.description',
  SCENARIO_TAGS = 'cucumber.scenario.tags',
  SCENARIO_DESCRIPTION = 'cucumber.scenario.description',
  STEP_TYPE = 'cucumber.step.type',
  STEP_STATUS = 'cucumber.step.status',
  STEP_ARGS = 'cucumber.step.args',
}
