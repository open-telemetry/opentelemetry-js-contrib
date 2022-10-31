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
  DomAttributes,
  DomElements,
  INSTRUMENTATION_SCRIPT_NAME,
  Settings,
} from '../types';

export class InstrumentationInjector {
  scope: typeof chrome;
  doc: Document;
  logger: Console;

  constructor(scope: typeof chrome, doc: Document, logger: Console) {
    this.scope = scope;
    this.doc = doc;
    this.logger = logger;
  }

  inject(settings: Settings) {
    const script = this.scope.runtime.getURL(INSTRUMENTATION_SCRIPT_NAME);
    this.logger.log(
      `[otel-extension] injecting ${INSTRUMENTATION_SCRIPT_NAME}`
    );
    const tag = this.doc.createElement('script');
    tag.setAttribute('src', script);
    tag.setAttribute('id', DomElements.CONFIG_TAG);
    // Config is based via this data attribute, since CSP might not allow inline script tags, so this is more robust.
    tag.setAttribute(`data-${DomAttributes.CONFIG}`, JSON.stringify(settings));
    this.doc.head.appendChild(tag);
    this.logger.log(`[otel-extension] ${INSTRUMENTATION_SCRIPT_NAME} injected`);
  }

  static checkUrlFilter(urlFilter: string, href: string) {
    return urlFilter !== '' && (urlFilter === '*' || href.includes(urlFilter));
  }

  execute() {
    this.scope.storage.local.get('settings', ({ settings }) => {
      // Define label of badge.
      const urlFilter = settings.urlFilter;
      if (
        InstrumentationInjector.checkUrlFilter(
          urlFilter,
          this.doc.location.href
        )
      ) {
        this.logger.log(
          `[otel-extension] ${this.doc.location.href} includes ${urlFilter}`
        );
        this.inject(settings);
      } else {
        this.logger.log(
          `[otel-extension] ${this.doc.location.href} does not include ${urlFilter}`
        );
      }
    });
  }
}
