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

require('./tracer')('example-resource');
const Memcached = require('memcached');
const assert = require('assert');

const KEY = '_KEY_';
const VALUE = `RAND:${Math.random().toFixed(4)}`;
const LT = 10;
const client = new Memcached();

client.set(KEY, VALUE, LT, err => {
  assert.strictEqual(err, undefined);
  client.get(KEY, (err, result) => {
    assert.strictEqual(err, undefined);
    assert.strictEqual(result, VALUE);
    console.log(
      'Sleeping 5 seconds before shutdown to ensure all records are flushed.'
    );
    setTimeout(() => {
      console.log('Completed.');
    }, 5000);
  });
});
