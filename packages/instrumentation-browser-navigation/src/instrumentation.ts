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
  BrowserNavigationInstrumentationConfig,
  NavigationType,
  ApplyCustomLogRecordDataFunction,
} from './types';

/**
 * This class represents a browser navigation instrumentation plugin
 */
export const EVENT_NAME = 'browser.navigation';
export const ATTR_URL_FULL = 'url.full';
export const ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT = 'browser.navigation.same_document';
export const ATTR_BROWSER_NAVIGATION_HASH_CHANGE = 'browser.navigation.hash_change';
export const ATTR_BROWSER_NAVIGATION_HASH_TYPE = 'browser.navigation.type';

export class BrowserNavigationInstrumentation extends InstrumentationBase<BrowserNavigationInstrumentationConfig> {
  eventLogger: Logger | null = null;
  applyCustomLogRecordData: ApplyCustomLogRecordDataFunction | undefined =
    undefined;
  private _onLoadHandler?: () => void;
  private _onPopStateHandler?: (ev: PopStateEvent) => void;
  private _onNavigateHandler?: (ev: Event) => void;
  private _lastUrl: string = location.href;

  /**
   *
   * @param config
   */
  constructor(config: BrowserNavigationInstrumentationConfig) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    this.eventLogger = logs.getLogger(PACKAGE_NAME, PACKAGE_VERSION);
    this.applyCustomLogRecordData = config?.applyCustomLogRecordData;
  }

  init() {}

  /**
   * callback to be executed when using hard navigation
   */
  private _onHardNavigation() {
    const navLogRecord: LogRecord = {
      eventName: EVENT_NAME,
      attributes: {
        [ATTR_URL_FULL]: this._sanitizeUrl(document.documentURI),
        [ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT]: false,
        [ATTR_BROWSER_NAVIGATION_HASH_CHANGE]: false,
      },
    };
    this._applyCustomLogRecordData(navLogRecord, this.applyCustomLogRecordData);
    this.eventLogger?.emit(navLogRecord);
  }

  /**
   * callback to be executed when using soft navigation
   */
  private _onSoftNavigation(changeState: string | null | undefined, navigationEvent?: any) {
    const referrerUrl = this._lastUrl;
    const currentUrl = (changeState === 'navigate' && navigationEvent?.destination?.url) 
      ? navigationEvent.destination.url 
      : location.href;
    
    if (referrerUrl === currentUrl) {
      return;
    }
    
    const navType = this._mapChangeStateToType(changeState, navigationEvent);
    const sameDocument = this._determineSameDocument(changeState, navigationEvent, referrerUrl, currentUrl);
    const hashChange = this._determineHashChange(changeState, navigationEvent, referrerUrl, currentUrl);
    const navLogRecord: LogRecord = {
      eventName: EVENT_NAME,
      attributes: {
        [ATTR_URL_FULL]: this._sanitizeUrl(currentUrl),
        [ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT]: sameDocument,
        [ATTR_BROWSER_NAVIGATION_HASH_CHANGE]: hashChange,
        ...(navType ? { [ATTR_BROWSER_NAVIGATION_HASH_TYPE]: navType } : {}),
      },
    };
    this._applyCustomLogRecordData(navLogRecord, this.applyCustomLogRecordData);
    this.eventLogger?.emit(navLogRecord);
    
    // Update the last known URL after processing
    this._lastUrl = currentUrl;
  }

  public _setLogger(eventLogger: Logger) {
    this.eventLogger = eventLogger;
  }

  /**
   * executes callback {_onDOMContentLoaded } when the page is viewed
   */
  private _waitForPageLoad() {
    // Ensure previous handler is removed before adding a new one
    if (this._onLoadHandler) {
      document.removeEventListener('DOMContentLoaded', this._onLoadHandler);
    }
    this._onLoadHandler = this._onHardNavigation.bind(this);
    document.addEventListener('DOMContentLoaded', this._onLoadHandler);
  }

  /**
   * implements enable function
   */
  override enable() {
    const cfg = this.getConfig() as BrowserNavigationInstrumentationConfig;
    const useNavigationApiIfAvailable = !!cfg.useNavigationApiIfAvailable;
    const navigationApi = useNavigationApiIfAvailable && (window as any).navigation as EventTarget;

    // Only patch history API if Navigation API is not available
    if (!navigationApi) {
      this._patchHistoryApi();
    }
    
    // Always listen for page load
    this._waitForPageLoad();

    if (navigationApi) {
      if (this._onNavigateHandler) {
        navigationApi.removeEventListener('navigate', this._onNavigateHandler);
        this._onNavigateHandler = undefined;
      }
      this._onNavigateHandler = (event: any) => {
        this._onSoftNavigation('navigate', event);
      };
      navigationApi.addEventListener('navigate', this._onNavigateHandler);
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
        navigationApi?.removeEventListener?.('navigate', this._onNavigateHandler);
      } catch {}
      this._onNavigateHandler = undefined;
    }
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

  private _isHashChange(fromUrl: string, toUrl: string): boolean {
    try {
      const a = new URL(fromUrl, window.location.origin);
      const b = new URL(toUrl, window.location.origin);
      // Only consider it a hash change if:
      // 1. Base URL (origin + pathname + search) is identical
      // 2. Both URLs have hashes and they're different, OR we're adding a hash
      const sameBase = a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
      const fromHasHash = a.hash !== '';
      const toHasHash = b.hash !== '';
      const hashesAreDifferent = a.hash !== b.hash;
      
      return sameBase && hashesAreDifferent && (fromHasHash && toHasHash || !fromHasHash && toHasHash);
    } catch {
      // Fallback: check if base URLs are identical and we're changing/adding hash (not removing)
      const fromBase = fromUrl.split('#')[0];
      const toBase = toUrl.split('#')[0];
      const fromHash = fromUrl.split('#')[1] || '';
      const toHash = toUrl.split('#')[1] || '';
      
      const sameBase = fromBase === toBase;
      const hashesAreDifferent = fromHash !== toHash;
      const notRemovingHash = toHash !== ''; // Only true if we're not removing the hash
      
      return sameBase && hashesAreDifferent && notRemovingHash;
    }
  }

  private _determineSameDocument(
    changeState?: string | null,
    navigationEvent?: any,
    fromUrl?: string,
    toUrl?: string
  ): boolean {
    // For Navigation API events, use the sameDocument property if available
    if (changeState === 'navigate' && navigationEvent?.destination?.sameDocument !== undefined) {
      return navigationEvent.destination.sameDocument;
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
    // For Navigation API events, use the hashChange property if available
    if (changeState === 'navigate' && navigationEvent?.hashChange !== undefined) {
      return navigationEvent.hashChange;
    }
    
    // For all other cases, determine based on URL comparison
    if (fromUrl && toUrl) {
      return this._isHashChange(fromUrl, toUrl);
    }
    
    return false;
  }

  /**
   * Sanitizes URL according to OpenTelemetry specification:
   * - Redacts credentials (username:password)
   * - Redacts sensitive query parameters
   * - Preserves fragment when available
   */
  private _sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      
      // Redact credentials if present
      if (urlObj.username || urlObj.password) {
        urlObj.username = 'REDACTED';
        urlObj.password = 'REDACTED';
      }
      
      // Redact sensitive query parameters
      const sensitiveParams = [
        'password', 'passwd', 'secret', 'api_key', 'apikey', 'auth', 'authorization',
        'token', 'access_token', 'refresh_token', 'jwt', 'session', 'sessionid',
        'key', 'private_key', 'client_secret', 'client_id', 'signature', 'hash'
      ];
      
      for (const param of sensitiveParams) {
        if (urlObj.searchParams.has(param)) {
          urlObj.searchParams.set(param, 'REDACTED');
        }
      }
      
      return urlObj.toString();
    } catch {
      // If URL parsing fails, redact credentials and sensitive query parameters
      let sanitized = url.replace(/\/\/[^:]+:[^@]+@/, '//REDACTED:REDACTED@');
      
      // Redact sensitive query parameters using regex
      const sensitiveParams = [
        'password', 'passwd', 'secret', 'api_key', 'apikey', 'auth', 'authorization',
        'token', 'access_token', 'refresh_token', 'jwt', 'session', 'sessionid',
        'key', 'private_key', 'client_secret', 'client_id', 'signature', 'hash'
      ];
      
      for (const param of sensitiveParams) {
        // Match param=value or param%3Dvalue (URL encoded)
        const regex = new RegExp(`([?&]${param}(?:%3D|=))[^&]*`, 'gi');
        sanitized = sanitized.replace(regex, '$1REDACTED');
      }
      
      return sanitized;
    }
  }

  private _mapChangeStateToType(changeState?: string | null, navigationEvent?: any): NavigationType | undefined {
    // For Navigation API events, check if it's a hash change first
    if (changeState === 'navigate' && navigationEvent?.hashChange) {
      // Hash changes are always considered 'push' operations semantically
      return 'push';
    }
    
    // For Navigation API events, determine type based on event properties
    if (changeState === 'navigate') {
      // Check if this is a back/forward navigation (traverse)
      if (navigationEvent?.navigationType === 'traverse') {
        return 'traverse';
      }
      
      // Check if this is a replace operation
      if (navigationEvent?.navigationType === 'replace') {
        return 'replace';
      }
      
      // Check if this is a reload
      if (navigationEvent?.navigationType === 'reload') {
        return 'reload';
      }
      
      // Default to 'push' for new navigations (link clicks, programmatic navigation)
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
