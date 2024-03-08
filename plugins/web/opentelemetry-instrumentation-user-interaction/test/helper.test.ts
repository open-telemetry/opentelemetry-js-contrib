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

import * as tracing from '@opentelemetry/sdk-trace-base';
// @ts-expect-error: not an export, but we want the prebundled version
import chai from 'chai/chai.js';

const { assert } = chai as typeof import('chai');

export class DummySpanExporter implements tracing.SpanExporter {
  export(spans: tracing.ReadableSpan[]) {}

  shutdown() {
    return Promise.resolve();
  }
}

export function createButton(disabled?: boolean): HTMLElement {
  const button = document.createElement('button');
  button.setAttribute('id', 'testBtn');
  if (disabled) {
    button.setAttribute('disabled', 'disabled');
  }
  return button;
}

export function fakeClickInteraction(
  callback: Function = function () {},
  element: HTMLElement = createButton()
) {
  element.addEventListener('click', () => {
    callback();
  });

  element.click();
}

export function fakeEventInteraction(
  eventType: string,
  callback: Function = function () {},
  elem?: HTMLElement
) {
  const element: HTMLElement = elem || createButton();
  const event = document.createEvent('Event');
  event.initEvent(eventType, true, true);

  element.addEventListener(eventType, () => {
    callback();
  });

  element.dispatchEvent(event);
}

export function assertClickSpan(span: tracing.ReadableSpan, id = 'testBtn') {
  assertInteractionSpan(span, { name: 'click', elementId: id });
}

export function assertInteractionSpan(
  span: tracing.ReadableSpan,
  {
    name,
    eventType = name,
    elementId = 'testBtn',
  }: { name: string; eventType?: string; elementId?: string }
) {
  assert.strictEqual(span.name, name);

  const attributes = span.attributes;
  assert.strictEqual(attributes.event_type, eventType);
  assert.strictEqual(attributes.target_element, 'BUTTON');
  assert.strictEqual(attributes.target_xpath, `//*[@id="${elementId}"]`);
  assert.ok(attributes['http.url'] !== '');
  assert.ok(attributes['user_agent'] !== '');
}

export function getData(url: string, callbackAfterSend: Function) {
  return new Promise((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.send();

    req.onload = resolve;
    req.onerror = reject;
    req.ontimeout = reject;

    callbackAfterSend();
  });
}
