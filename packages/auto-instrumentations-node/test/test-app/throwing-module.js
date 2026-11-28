/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Used in register.test.ts. Preloaded BEFORE the register hook, this makes one
// instrumentation module fail to load, simulating a corrupted file, a partial
// upgrade or a version skew inside an installation. It does so without touching
// node_modules, so the test is hermetic.
const Module = require('module');

const TARGET = '@opentelemetry/instrumentation-undici';
const originalLoad = Module._load;

Module._load = function (request, ...rest) {
  if (request === TARGET) {
    throw new Error(`simulated failure loading ${TARGET}`);
  }
  return originalLoad.call(this, request, ...rest);
};
