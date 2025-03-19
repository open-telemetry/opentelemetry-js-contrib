/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * This script can be used with `mocha --require ...` to support skipping
 * tests if the current version of Node.js is too old.  For example, say
 * a package's unit tests cannot run with Node.js 14, but the CI unit tests
 * run all package test with that version.
 *
 * 1. Change this in "package.json":
 *      "test": "nyc mocha ...",
 *    to this:
 *      "test": "SKIP_TEST_IF_NODE_OLDER_THAN=18 nyc mocha --require '../../../scripts/skip-test-if.js' ... ",
 *    where `SKIP_TEST_IF_NODE_OLDER_THAN` indicates the minimum Node.js major
 *    version.
 *
 * 2. ".tav.yml" blocks should set SKIP_TEST_IF_DISABLE=true to
 *    disable the skipping. Via this in each test block:
 *      env:
 *        - SKIP_TEST_IF_DISABLE=true
 */

function skipTestIf() {
  if (process.env.SKIP_TEST_IF_DISABLE) {
    return;
  }

  const minNodeMajor = process.env.SKIP_TEST_IF_NODE_OLDER_THAN ?? Number(process.env.SKIP_TEST_IF_NODE_OLDER_THAN);
  if (!minNodeMajor || isNaN(minNodeMajor)) {
    console.warn('skip-test-if warning: set a minimum Node.js major version via SKIP_TEST_IF_NODE_OLDER_THAN=<num>');
    return;
  }

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < minNodeMajor) {
    process.stderr.write(`skip-test-if: skipping tests on old Node.js (${nodeMajor} < ${minNodeMajor})\n`);
    // "Skip" tests by exiting the process. Mocha is all in one process.
    process.exit(0);
  }
}

skipTestIf()

