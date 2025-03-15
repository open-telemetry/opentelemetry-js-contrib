/*!
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
