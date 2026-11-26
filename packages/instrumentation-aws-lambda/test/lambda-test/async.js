/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
const api = require('@opentelemetry/api');

exports.handler = async function (event, context) {
  return 'ok';
};

exports.error = async function (event, context) {
  throw new Error('handler error');
};

exports.stringerror = async function (event, context) {
  throw 'handler error';
};

exports.context = async function (event, context) {
  return api.trace.getSpan(api.context.active()).spanContext().traceId;
};

exports.handler_return_baggage = async function (event, context) {
  const [baggageEntryKey, baggageEntryValue] = api.propagation
    .getBaggage(api.context.active())
    .getAllEntries()[0];
  return `${baggageEntryKey}=${baggageEntryValue.value}`;
};
