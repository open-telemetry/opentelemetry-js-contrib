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
const api = require('@opentelemetry/api');
const { callbackerror } = require('./sync');

exports.handler = async function (event, context) {
  return { statusCode: 200 };
};

exports.error500 = async function (event, context) {
  return { statusCode: 500 };
}

exports.error400 = async function (event, context) {
  return { statusCode: 400 };
}

exports.error500Sync = async function (event, context) {
  return { statusCode: 500 };
}

exports.error400Sync =  function (event, context, callback) {
  return callback( undefined, { statusCode: 400 } );
}

exports.errorAsync = async function (event, context) {
  throw new Error('handler error');
}

exports.errorSync =  function (event, context) {
  throw new Error('handler error');
}
