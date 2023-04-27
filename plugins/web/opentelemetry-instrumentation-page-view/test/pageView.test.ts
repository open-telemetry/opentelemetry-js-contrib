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

import {
  LoggerProvider,
  InMemoryLogRecordExporter,
  SimpleLogRecordProcessor,
  ReadableLogRecord,
} from '@opentelemetry/sdk-logs';

import * as assert from 'assert';
import * as sinon from 'sinon';
import { PageViewEventInstrumentation } from '../src';

const exporter = new InMemoryLogRecordExporter();
const provider = new LoggerProvider();
const logRecordProcessor = new SimpleLogRecordProcessor(exporter);

provider.addLogRecordProcessor(logRecordProcessor);

describe('PageView Instrumentation', () => {
  let plugin: PageViewEventInstrumentation;
  const sandbox = sinon.createSandbox();

  beforeEach(() => {
    Object.defineProperty(window.document, 'readyState', {
      writable: true,
      value: 'complete',
    });
    plugin = new PageViewEventInstrumentation({
      enabled: false,
      provider: provider,
    });
    exporter.reset();
  });

  afterEach(async () => {
    sandbox.restore();
    Object.defineProperty(window.document, 'readyState', {
      writable: true,
      value: 'complete',
    });
    plugin.disable();
  });

  describe('constructor', () => {
    it('should construct an instance', () => {
      plugin = new PageViewEventInstrumentation({
        enabled: false,
        provider: provider,
      });
      assert.ok(plugin instanceof PageViewEventInstrumentation);
    });
  });

  describe('add custom attributes to spans', () => {
    it('should add attribute to document load span', done => {
      plugin = new PageViewEventInstrumentation({
        enabled: false,
        provider: provider,
      });
      plugin.enable();
      setTimeout(() => {
        assert.strictEqual(exporter.getFinishedLogRecords().length, 1);

        const pageViewLogRecord =
          exporter.getFinishedLogRecords()[0] as ReadableLogRecord;
        assert.strictEqual(
          pageViewLogRecord.attributes['event.domain'],
          'browser'
        );
        assert.strictEqual(
          pageViewLogRecord.attributes['event.name'],
          'page_view'
        );
        assert.strictEqual(pageViewLogRecord.attributes['event.type'], 0);
        assert.strictEqual(pageViewLogRecord.attributes['event.data'], {
          url: 'document.documentURI as string',
          referrer: 'document.referrer',
          title: 'document.title',
        });
        done();
      });
    });
  });
});
