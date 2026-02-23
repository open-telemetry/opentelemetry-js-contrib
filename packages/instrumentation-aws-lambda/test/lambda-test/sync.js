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
/* eslint-disable no-unused-vars */
const api = require('@opentelemetry/api');

// Promise-based handlers (all Node.js versions)
exports.handler = async function (_event, _context) {
  return 'ok';
};

exports.error = async function (_event, _context) {
  throw new Error('handler error');
};

exports.callbackerror = async function (_event, _context) {
  throw new Error('handler error');
};

exports.stringerror = async function (_event, _context) {
  throw 'handler error';
};

exports.context = async function (_event, _context) {
  return api.trace.getSpan(api.context.active()).spanContext().traceId;
};

// Callback-based handlers (Node.js 22 and lower only - for backward compatibility testing)
exports.callbackHandler = function (_event, _context, callback) {
  callback(null, 'ok');
};

exports.callbackError = function (_event, _context, callback) {
  callback(new Error('handler error'));
};

exports.callbackContext = function (_event, _context, callback) {
  callback(null, api.trace.getSpan(api.context.active()).spanContext().traceId);
};
