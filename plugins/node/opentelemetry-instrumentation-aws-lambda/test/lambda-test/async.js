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

exports.handler = async function (event, context) {
  return 'ok';
};

exports.error = async function (event, context) {
  throw new Error('handler error');
}

exports.stringerror = async function (event, context) {
  throw 'handler error';
}

exports.context = async function (event, context) {
  return api.trace.getSpan(api.context.active()).spanContext().traceId;
};

exports.handler_return_baggage = async function (event, context) {
  const [baggageEntryKey, baggageEntryValue] =  api.propagation.getBaggage(api.context.active()).getAllEntries()[0];
  return `${baggageEntryKey}=${baggageEntryValue.value}`;
}
