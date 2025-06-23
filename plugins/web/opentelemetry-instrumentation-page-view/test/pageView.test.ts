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

import * as sinon from 'sinon';
import { PageViewInstrumentation } from '../src';
import { logs } from '@opentelemetry/api-logs';
import { PageTypes } from '../src/enums/PageTypes';
import * as assert from 'assert';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

describe('PageView Instrumentation', () => {
  let plugin: PageViewInstrumentation;
  const sandbox = sinon.createSandbox();

  const exporter = new InMemoryLogRecordExporter();
  const provider = new LoggerProvider();
  const logRecordProcessor = new SimpleLogRecordProcessor(exporter);
  provider.addLogRecordProcessor(logRecordProcessor);
  logs.setGlobalLoggerProvider(provider);

  afterEach(() => {
    exporter.reset();
    plugin.disable();
  });

  describe('constructor', () => {
    it('should construct an instance', () => {
      plugin = new PageViewInstrumentation({
        enabled: false,
      });

      assert.strictEqual(exporter.getFinishedLogRecords().length, 0);
      assert.ok(plugin instanceof PageViewInstrumentation);
    });
  });

  describe('export page_view LogRecord', () => {
    it("should export LogRecord for page_view event type 0 when 'DOMContentLoaded' event is fired", done => {
      plugin = new PageViewInstrumentation({
        enabled: false,
      });

      const spy = sandbox.spy(document, 'addEventListener');
      // plugin.enable();
      registerInstrumentations({ instrumentations: [plugin] });

      setTimeout(() => {
        assert.ok(spy.calledOnce);

        document.dispatchEvent(new Event('DOMContentLoaded'));

        assert.strictEqual(exporter.getFinishedLogRecords().length, 1);

        const pageViewLogRecord =
          exporter.getFinishedLogRecords()[0] as ReadableLogRecord;
        assert.strictEqual(
          pageViewLogRecord.attributes['event.name'],
          'browser.page_view'
        );
        assert.deepEqual(pageViewLogRecord.body, {
          type: PageTypes.BASE_PAGE,
          url: document.documentURI as string,
          referrer: document.referrer,
          title: document.title,
        });
        done();
      });
    });

    it('should export LogRecord for page_view event type 1 when history.pushState() is called', done => {
      const vpStartTime = 16842729000 * 1000000;
      const referrer = location.href;

      plugin = new PageViewInstrumentation({
        enabled: true,
        applyCustomLogRecordData: logRecord => {
          if (logRecord.body) {
            (logRecord.body as any)['vp.startTime'] = vpStartTime;
          }
        },
      });

      history.pushState({}, '', '/dummy1.html');
      assert.strictEqual(exporter.getFinishedLogRecords().length, 1);

      const pageViewLogRecord =
        exporter.getFinishedLogRecords()[0] as ReadableLogRecord;
      assert.strictEqual(
        pageViewLogRecord.attributes['event.name'],
        'browser.page_view'
      );

      assert.deepEqual(pageViewLogRecord.body, {
        url: document.documentURI as string,
        referrer: referrer,
        title: document.title,
        changeState: 'pushState',
        'vp.startTime': vpStartTime,
        type: PageTypes.VIRTUAL_PAGE,
      });
      done();
    });

    it('should export LogRecord for page_view event type 1 when history.replaceState() is called', done => {
      const vpStartTime = 16842729000 * 1000000;
      const referrer = location.href;

      plugin = new PageViewInstrumentation({
        enabled: true,
        applyCustomLogRecordData: logRecord => {
          if (logRecord.body) {
            (logRecord.body as any)['vp.startTime'] = vpStartTime;
          }
        },
      });

      history.replaceState({}, '', '/dummy2.html');

      assert.strictEqual(exporter.getFinishedLogRecords().length, 1);

      const pageViewLogRecord =
        exporter.getFinishedLogRecords()[0] as ReadableLogRecord;
      assert.strictEqual(
        pageViewLogRecord.attributes['event.name'],
        'browser.page_view'
      );

      assert.deepEqual(pageViewLogRecord.body, {
        url: document.documentURI as string,
        referrer: referrer,
        title: document.title,
        changeState: 'replaceState',
        'vp.startTime': vpStartTime,
        type: PageTypes.VIRTUAL_PAGE,
      });
      done();
    });

    it('should not export LogRecord for page_view event type 1 if the referrer is not changed.', done => {
      const vpStartTime = 16842729000 * 1000000;

      plugin = new PageViewInstrumentation({
        enabled: true,
        applyCustomLogRecordData: logRecord => {
          if (logRecord.body) {
            (logRecord.body as any)['vp.startTime'] = vpStartTime;
          }
        },
      });

      const firstReferrer = location.href;
      history.pushState({}, '', '/dummy3.html');
      assert.strictEqual(exporter.getFinishedLogRecords().length, 1);

      const pageViewLogRecord =
        exporter.getFinishedLogRecords()[0] as ReadableLogRecord;
      assert.strictEqual(
        pageViewLogRecord.attributes['event.name'],
        'browser.page_view'
      );

      assert.deepEqual(pageViewLogRecord.body, {
        url: document.documentURI as string,
        referrer: firstReferrer,
        title: document.title,
        changeState: 'pushState',
        'vp.startTime': vpStartTime,
        type: PageTypes.VIRTUAL_PAGE,
      });

      const secondReferrer = location.href;
      history.pushState({}, '', '/dummy3.html');
      assert.strictEqual(exporter.getFinishedLogRecords().length, 1);

      const pageViewLogRecord2 =
        exporter.getFinishedLogRecords()[0] as ReadableLogRecord;

      assert.strictEqual(
        pageViewLogRecord2.attributes['event.name'],
        'browser.page_view'
      );

      assert.deepEqual(pageViewLogRecord2.body, {
        url: document.documentURI as string,
        referrer: firstReferrer,
        title: document.title,
        changeState: 'pushState',
        'vp.startTime': vpStartTime,
        type: PageTypes.VIRTUAL_PAGE,
      });

      assert.notStrictEqual(
        (<any>pageViewLogRecord2.body)['referrer'],
        secondReferrer
      );
      done();
    });
  });
});
