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

exports.handler = function (event, context, callback) {
  callback(null, 'ok');
};

exports.error = function (event, context, callback) {
  throw new Error('handler error');
}

exports.callbackerror = function (event, context, callback) {
  callback(new Error('handler error'));
}

exports.stringerror = function (event, context, callback) {
  throw 'handler error';
}

exports.callbackstringerror = function (event, context, callback) {
  callback('handler error');
}

exports.context = function (event, context, callback) {
  callback(null, api.trace.getSpan(api.context.active()).spanContext().traceId);
};
