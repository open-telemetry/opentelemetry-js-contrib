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
  InstrumentationBase,
  InstrumentationConfig,
} from '@opentelemetry/instrumentation';
import { LogRecord } from '@opentelemetry/api-logs';
import { VERSION } from './version';

/**
 * This class represents a Page View Event plugin
 */
export class PageViewEventInstrumentation extends InstrumentationBase<unknown> {
  readonly component: string = 'page-view-event';
  readonly version: string = '1';

  /**
   *
   * @param config
   */
  constructor(config: InstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-page-view', VERSION, config);
  }

  init() {}

  /**
   * callback to be executed when page is viewed
   */
  private _onPageView() {
    const pageViewEvent: LogRecord = {
      attributes: {
        'event.domain': 'browser',
        'event.name': 'page_view',
        'event.data': {
          type: 0,
          url: document.documentURI as string,
          referrer: document.referrer,
          title: document.title,
        },
      },
    };

    this.logger?.emit(pageViewEvent);
  }

  /**
   * executes callback {_onPageView } when the DOM Content is loaded
   */
  private _waitForPageLoad() {
    document.addEventListener('DOMContentLoaded', this._onPageView.bind(this));
  }

  /**
   * implements enable function
   */
  override enable() {
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
    document.removeEventListener(
      'DOMContentLoaded',
      this._onPageView.bind(this)
    );
  }
}
