/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { HapiInstrumentation } from '../src';

let plugin: HapiInstrumentation;
export function getPlugin() {
  if (!plugin) {
    plugin = new HapiInstrumentation();
  }
  return plugin;
}
