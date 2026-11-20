/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NestInstrumentation } from '../../dist/index.mjs';
import scenario from './scenario.cjs';

await scenario.run(NestInstrumentation, async () => ({
  core: await import('@nestjs/core'),
  common: await import('@nestjs/common'),
  platform: await import('@nestjs/platform-express'),
}));
