/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Used in register.test.ts as a minimal application whose only output is a single
// known line, so that anything else on stdout came from the instrumentation.
console.log('APP_RAN');
