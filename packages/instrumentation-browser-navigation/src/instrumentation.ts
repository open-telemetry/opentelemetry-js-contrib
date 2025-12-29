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
import type { LogRecord } from '@opentelemetry/api-logs';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import {
  BrowserNavigationInstrumentationConfig,
  NavigationType,
  ApplyCustomLogRecordDataFunction,
  SanitizeUrlFunction,
} from './types';
import { isHashChange } from './utils';

/**
 * This class represents a browser navigation instrumentation plugin
 */
export const EVENT_NAME = 'browser.navigation';
export const ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT =
  'browser.navigation.same_document';
export const ATTR_BROWSER_NAVIGATION_HASH_CHANGE =
  'browser.navigation.hash_change';
export const ATTR_BROWSER_NAVIGATION_TYPE = 'browser.navigation.type';

export class BrowserNavigationInstrumentation extends InstrumentationBase<BrowserNavigationInstrumentationConfig> {
  applyCustomLogRecordData: ApplyCustomLogRecordDataFunction | undefined =
    undefined;
  sanitizeUrl?: SanitizeUrlFunction; // No default sanitization
  private _onLoadHandler?: () => void;
  private _onPopStateHandler?: (ev: PopStateEvent) => void;
  private _onNavigateHandler?: (ev: Event) => void;
  private _lastUrl: string = location.href;
  private _hasProcessedInitialLoad: boolean = false;

  /**
   *
   * @param config
   */
  constructor(config: BrowserNavigationInstrumentationConfig) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    this.applyCustomLogRecordData = config?.applyCustomLogRecordData;
    this.sanitizeUrl = config?.sanitizeUrl;
  }

  init() {}

  /**
   * callback to be executed when using hard navigation
   */
  private _onHardNavigation() {
    const navLogRecord: LogRecord = {
      eventName: EVENT_NAME,
      attributes: {
        [ATTR_URL_FULL]: this.sanitizeUrl
          ? this.sanitizeUrl(document.documentURI)
          : document.documentURI,
        [ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT]: false,
        [ATTR_BROWSER_NAVIGATION_HASH_CHANGE]: false,
      },
    };
    this._applyCustomLogRecordData(navLogRecord, this.applyCustomLogRecordData);
    this.logger.emit(navLogRecord);
  }

  /**
   * callback to be executed when using soft navigation
   */
  private _onSoftNavigation(
    changeState: string | null | undefined,
    navigationEvent?: any
  ) {
    const referrerUrl = this._lastUrl;
    const currentUrl =
      changeState === 'currententrychange' &&
      navigationEvent?.target?.currentEntry?.url
        ? navigationEvent.target.currentEntry.url
        : location.href;

    if (referrerUrl === currentUrl) {
      return;
    }

    const navType = this._mapChangeStateToType(changeState, navigationEvent);
    const sameDocument = this._determineSameDocument(
      changeState,
      navigationEvent,
      referrerUrl,
      currentUrl
    );
    const hashChange = this._determineHashChange(
      changeState,
      navigationEvent,
      referrerUrl,
      currentUrl
    );
    const navLogRecord: LogRecord = {
      eventName: EVENT_NAME,
      attributes: {
        [ATTR_URL_FULL]: this.sanitizeUrl
          ? this.sanitizeUrl(currentUrl)
          : currentUrl,
        [ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT]: sameDocument,
        [ATTR_BROWSER_NAVIGATION_HASH_CHANGE]: hashChange,
        ...(navType ? { [ATTR_BROWSER_NAVIGATION_TYPE]: navType } : {}),
      },
    };
    this._applyCustomLogRecordData(navLogRecord, this.applyCustomLogRecordData);
    this.logger.emit(navLogRecord);

    // Update the last known URL after processing
    this._lastUrl = currentUrl;
  }

  /**
   * executes callback {_onDOMContentLoaded } when the page is viewed
   */
  private _waitForPageLoad() {
    // Check if document has already loaded completely
    if (document.readyState === 'complete' && !this._hasProcessedInitialLoad) {
      this._hasProcessedInitialLoad = true;
      // Use setTimeout to allow tests to reset exporter before this fires
      setTimeout(() => this._onHardNavigation(), 0);
      return;
    }

    // Ensure previous handler is removed before adding a new one
    if (this._onLoadHandler) {
      document.removeEventListener('DOMContentLoaded', this._onLoadHandler);
    }
    this._onLoadHandler = () => {
      if (!this._hasProcessedInitialLoad) {
        this._hasProcessedInitialLoad = true;
        this._onHardNavigation();
      }
    };
    document.addEventListener('DOMContentLoaded', this._onLoadHandler);
  }

  /**
   * implements enable function
   */
  override enable() {
    const cfg = this.getConfig() as BrowserNavigationInstrumentationConfig;
    const useNavigationApiIfAvailable = !!cfg.useNavigationApiIfAvailable;
    const navigationApi =
      useNavigationApiIfAvailable &&
      ((window as any).navigation as EventTarget);

    // Only patch history API if Navigation API is not available
    if (!navigationApi) {
      this._patchHistoryApi();
    }

    // Always listen for page load
    this._waitForPageLoad();

    if (navigationApi) {
      if (this._onNavigateHandler) {
        navigationApi.removeEventListener(
          'currententrychange',
          this._onNavigateHandler
        );
        this._onNavigateHandler = undefined;
      }
      this._onNavigateHandler = (event: any) => {
        this._onSoftNavigation('currententrychange', event);
      };
      navigationApi.addEventListener(
        'currententrychange',
        this._onNavigateHandler
      );
    } else {
      if (this._onPopStateHandler) {
        window.removeEventListener('popstate', this._onPopStateHandler);
        this._onPopStateHandler = undefined;
      }
      this._onPopStateHandler = () => {
        this._onSoftNavigation('popstate');
      };
      window.addEventListener('popstate', this._onPopStateHandler);
    }
  }

  /**
   * implements disable function
   */
  override disable() {
    this._unpatchHistoryApi();
    if (this._onLoadHandler) {
      document.removeEventListener('DOMContentLoaded', this._onLoadHandler);
      this._onLoadHandler = undefined;
    }
    if (this._onPopStateHandler) {
      window.removeEventListener('popstate', this._onPopStateHandler);
      this._onPopStateHandler = undefined;
    }
    if (this._onNavigateHandler) {
      try {
        const navigationApi = (window as any).navigation as EventTarget;
        navigationApi?.removeEventListener?.(
          'currententrychange',
          this._onNavigateHandler
        );
      } catch {
        // Ignore errors when removing Navigation API listeners
      }
      this._onNavigateHandler = undefined;
    }
    // Reset the initial load flag so it can be processed again if re-enabled
    this._hasProcessedInitialLoad = false;
  }

  /**
   * Patches the history api method
   */
  _patchHistoryMethod(changeState: string) {
    const plugin = this;
    return (original: any) => {
      return function patchHistoryMethod(this: History, ...args: unknown[]) {
        const result = original.apply(this, args);
        const currentUrl = location.href;
        if (currentUrl !== plugin._lastUrl) {
          plugin._onSoftNavigation(changeState);
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

  private _determineSameDocument(
    changeState?: string | null,
    navigationEvent?: any,
    fromUrl?: string,
    toUrl?: string
  ): boolean {
    // For Navigation API currententrychange events
    if (changeState === 'currententrychange') {
      // For currententrychange, we can check if the navigation was same-document
      // by comparing origins or checking if it's a SPA navigation
      if (fromUrl && toUrl) {
        try {
          const fromURL = new URL(fromUrl);
          const toURL = new URL(toUrl);
          return fromURL.origin === toURL.origin;
        } catch {
          return true; // Fallback to same document
        }
      }
      // Default to true for same-document navigations in SPAs
      return true;
    }

    // For other navigation types, determine based on URL comparison
    if (fromUrl && toUrl) {
      try {
        const fromURL = new URL(fromUrl);
        const toURL = new URL(toUrl);
        // Same document if origin is the same (cross-origin navigations are always different documents)
        // In SPAs, route changes via pushState/replaceState are same-document navigations
        return fromURL.origin === toURL.origin;
      } catch {
        // Fallback: assume same document for relative URLs or parsing errors
        return true;
      }
    }

    // Default: if we can't determine URLs, assume it's a same-document navigation
    // This handles cases where URL comparison fails
    return true;
  }

  /**
   * Determines if navigation is a hash change based on URL comparison
   * A hash change is true if the URLs are the same except for the hash part
   */
  private _determineHashChange(
    changeState?: string | null,
    navigationEvent?: any,
    fromUrl?: string,
    toUrl?: string
  ): boolean {
    // For Navigation API currententrychange events, determine based on URL comparison
    if (changeState === 'currententrychange') {
      if (fromUrl && toUrl) {
        return isHashChange(fromUrl, toUrl);
      }
      return false;
    }

    // For all other cases, determine based on URL comparison
    if (fromUrl && toUrl) {
      return isHashChange(fromUrl, toUrl);
    }

    return false;
  }

  private _mapChangeStateToType(
    changeState?: string | null,
    navigationEvent?: any
  ): NavigationType | undefined {
    // For Navigation API currententrychange events
    if (changeState === 'currententrychange') {
      // First, try to get navigation type from the currententrychange event itself
      if (navigationEvent?.navigationType) {
        const navType = navigationEvent.navigationType;
        switch (navType) {
          case 'traverse':
            return 'traverse';
          case 'replace':
            return 'replace';
          case 'reload':
            return 'reload';
          case 'push':
          default:
            return 'push';
        }
      }

      // Fallback: For currententrychange events without type info, default to 'push'
      // Most programmatic navigations (history.pushState, link clicks) are 'push' operations
      return 'push';
    }

    switch (changeState) {
      case 'pushState':
        return 'push';
      case 'replaceState':
        return 'replace';
      case 'popstate':
        // For popstate, we need to check if it's a hash change to determine type
        // This is called after _determineHashChange, so we need to check URLs here too
        return 'traverse'; // Default to traverse, but hash changes will be handled specially
      case 'hashchange':
        return 'push';
      case 'navigate':
        return 'push';
      default:
        return undefined;
    }
  }
}
