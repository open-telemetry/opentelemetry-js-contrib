/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
const api = require('@opentelemetry/api');

// Promise-based handlers (all Node.js versions)
exports.handler = async function (event, context) {
  return 'ok';
};

exports.error = async function (event, context) {
  throw new Error('handler error');
};

exports.callbackerror = async function (event, context) {
  throw new Error('handler error');
};

exports.stringerror = async function (event, context) {
  throw 'handler error';
};

exports.context = async function (event, context) {
  return api.trace.getSpan(api.context.active()).spanContext().traceId;
};

// Callback-based handlers (Node.js 22 and lower only - for backward compatibility testing)
exports.callbackHandler = function (event, context, callback) {
  callback(null, 'ok');
};

exports.callbackError = function (event, context, callback) {
  callback(new Error('handler error'));
};

exports.callbackContext = function (event, context, callback) {
  callback(null, api.trace.getSpan(api.context.active()).spanContext().traceId);
};
