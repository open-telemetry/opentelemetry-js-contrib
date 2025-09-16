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

import { InstrumentationBase, isWrapped } from '@opentelemetry/instrumentation';
import { LogRecord, logs, Logger } from '@opentelemetry/api-logs';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import {
  ApplyCustomLogRecordDataFunction,
  PageViewInstrumentationConfig,
} from './types';
import { PageTypes } from './enums/PageTypes';
/**
 * This class represents a page view instrumentation plugin
 */
const EVENT_NAME = 'browser.page.view';
const URL_FULL_ATTRIBUTE = 'url.full';
const REFERRER_ATTRIBUTE = 'browser.page.referrer_url';
const PAGE_TYPE_ATTRIBUTE = 'browser.page_view.type';

export class PageViewInstrumentation extends InstrumentationBase<PageViewInstrumentationConfig> {
  eventLogger: Logger | null = null;
  oldUrl = location.href;
  applyCustomLogRecordData: ApplyCustomLogRecordDataFunction | undefined =
    undefined;

  /**
   *
   * @param config
   */
  constructor(config: PageViewInstrumentationConfig) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    this.eventLogger = logs.getLogger(PACKAGE_NAME, PACKAGE_VERSION);
    this.applyCustomLogRecordData = config?.applyCustomLogRecordData;
  }

  init() {}

  /**
   * callback to be executed when using hard navigation
   */
  private _onPageView() {
    const pageViewLogRecord: LogRecord = {
      eventName: EVENT_NAME,
      attributes: {
        [URL_FULL_ATTRIBUTE]: document.documentURI as string,
        [REFERRER_ATTRIBUTE]: document.referrer,
        [PAGE_TYPE_ATTRIBUTE]: PageTypes.PHYSICAL_PAGE,
      },
    };
    this._applyCustomLogRecordData(
      pageViewLogRecord,
      this.applyCustomLogRecordData
    );
    this.eventLogger?.emit(pageViewLogRecord);
  }

  /**
   * callback to be executed when using soft navigation
   */
  private _onVirtualPageView(changeState: string | null | undefined) {
    const referrer = this.oldUrl;
    // Don't emit an event if the route didn't change
    if (referrer === location.href) {
      return;
    }
    const vPageViewLogRecord: LogRecord = {
      eventName:  EVENT_NAME,
      attributes: {
        [URL_FULL_ATTRIBUTE]: window.location.href,
        [REFERRER_ATTRIBUTE]: referrer,
        [PAGE_TYPE_ATTRIBUTE]: PageTypes.VIRTUAL_PAGE,
      },
    };
    this._applyCustomLogRecordData(
      vPageViewLogRecord,
      this.applyCustomLogRecordData
    );
    this.eventLogger?.emit(vPageViewLogRecord);
  }

  public _setLogger(eventLogger: Logger) {
    this.eventLogger = eventLogger;
  }

  /**
   * executes callback {_onDOMContentLoaded } when the page is viewed
   */
  private _waitForPageLoad() {
    document.addEventListener('DOMContentLoaded', this._onPageView.bind(this));
  }

  /**
   * implements enable function
   */
  override enable() {
    this._patchHistoryApi();
    // remove previously attached load to avoid adding the same event twice
    // in case of multiple enable calling.
    document.removeEventListener(
      'DOMContentLoaded',
      this._onPageView.bind(this)
    );
    this._waitForPageLoad();
  }

  /**
   * implements disable function
   */
  override disable() {
    this._unpatchHistoryApi();
    document.removeEventListener(
      'DOMContentLoaded',
      this._onPageView.bind(this)
    );
  }

  /**
   * Patches the history api method
   */
  _patchHistoryMethod(changeState: string) {
    const plugin = this;
    return (original: any) => {
      return function patchHistoryMethod(this: History, ...args: unknown[]) {
        const result = original.apply(this, args);
        const url = location.href;
        const oldUrl = plugin.oldUrl;
        if (url !== oldUrl) {
          plugin._onVirtualPageView(changeState);
          plugin.oldUrl = location.href;
        }
        return result;
      };
    };
  }

  private _patchHistoryApi(): void {
    // unpatching here disables other instrumentation that use the same api to wrap history, commenting it out
    // this._unpatchHistoryApi();
    this._wrap(
      history,
      'replaceState',
      this._patchHistoryMethod('replaceState')
    );
    this._wrap(history, 'pushState', this._patchHistoryMethod('pushState'));
  }
  /**
   * unpatch the history api methods
   */
  _unpatchHistoryApi() {
    if (isWrapped(history.replaceState)) this._unwrap(history, 'replaceState');
    if (isWrapped(history.pushState)) this._unwrap(history, 'pushState');
  }

  /**
   *
   * @param logRecord
   * @param applyCustomLogRecordData
   * Add custom data to the event
   */
  _applyCustomLogRecordData(
    logRecord: LogRecord,
    applyCustomLogRecordData: ApplyCustomLogRecordDataFunction | undefined
  ) {
    if (applyCustomLogRecordData) {
      applyCustomLogRecordData(logRecord);
    }
  }
}
