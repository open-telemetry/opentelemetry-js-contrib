/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { nodeResolve as nodeResolveRollup } from '@rollup/plugin-node-resolve';
import commonjsRollup from '@rollup/plugin-commonjs';
import { esbuildPlugin } from '@web/dev-server-esbuild';
import { fromRollup } from '@web/dev-server-rollup';
import { chromeLauncher } from '@web/test-runner';

const nodeResolve = fromRollup(nodeResolveRollup);
const commonjs = fromRollup(commonjsRollup);

export default {
  files: ['test/**/*.test.ts'],
  nodeResolve: true,
  browsers: [chromeLauncher({ launchOptions: { args: ['--no-sandbox'] } })],
  plugins: [
    esbuildPlugin({ ts: true }),
    nodeResolve({ browser: true, preferBuiltins: false }),
    commonjs(),
  ],
};
