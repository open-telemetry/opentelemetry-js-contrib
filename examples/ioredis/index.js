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

'use strict';

// Require tracer before any other modules
require('./tracer');
const Redis = require('ioredis');

const redis = new Redis();

async function main() {
  try {
    await redis.set('test', 'data');
  } catch (error) {
    console.error(error);
  }

  // The process must live for at least the interval past any traces that
  // must be exported, or some risk being lost if they are recorded after the
  // last export.
  console.log(
    'Sleeping 5 seconds before shutdown to ensure all records are flushed.'
  );
  setTimeout(() => {
    console.log('Completed.');
  }, 5000);
}

main();
