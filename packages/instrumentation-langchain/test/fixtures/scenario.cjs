/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

require('./register.cjs');
const path = require('node:path');
const { createRequire } = require('node:module');
const sdkRequire = process.env.LANGCHAIN_TEST_ROOT
  ? createRequire(path.join(process.env.LANGCHAIN_TEST_ROOT, 'package.json'))
  : require;
const exercise = require('./exercise.cjs');
exercise({
  ...sdkRequire('@langchain/core/runnables'),
  ...sdkRequire('@langchain/core/tools'),
  ...sdkRequire('@langchain/core/utils/testing'),
  ...(process.env.LANGCHAIN_TEST_CORE_ONLY === 'true'
    ? {}
    : {
        ...sdkRequire('langchain'),
        ...sdkRequire('@langchain/langgraph'),
        ...sdkRequire('@langchain/classic/vectorstores/memory'),
        ...sdkRequire('@langchain/core/embeddings'),
      }),
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
