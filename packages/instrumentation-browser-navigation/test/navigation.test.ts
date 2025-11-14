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
import { BrowserNavigationInstrumentation } from '../src';
import {
  EVENT_NAME,
  ATTR_URL_FULL,
  ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT,
  ATTR_BROWSER_NAVIGATION_HASH_CHANGE,
  ATTR_BROWSER_NAVIGATION_HASH_TYPE,
} from '../src/instrumentation';
import { logs } from '@opentelemetry/api-logs';
import * as assert from 'assert';
// registerInstrumentations removed - using plugin.enable() directly

describe('Browser Navigation Instrumentation', () => {
  let instrumentation: BrowserNavigationInstrumentation;
  const sandbox = sinon.createSandbox();

  const exporter = new InMemoryLogRecordExporter();
  const logRecordProcessor = new SimpleLogRecordProcessor(exporter);
  const provider = new LoggerProvider({
    processors: [logRecordProcessor],
  });
  logs.setGlobalLoggerProvider(provider);

  afterEach(() => {
    if (instrumentation) {
      instrumentation.disable();
    }
    exporter.reset();
    sandbox.restore();
  });

  describe('constructor', () => {
    it('should construct an instance', () => {
      instrumentation = new BrowserNavigationInstrumentation({
        enabled: false,
      });

      assert.strictEqual(exporter.getFinishedLogRecords().length, 0);
      assert.ok(instrumentation instanceof BrowserNavigationInstrumentation);
    });
  });

  describe('export navigation LogRecord', () => {
    it("should export LogRecord for browser.navigation when 'DOMContentLoaded' event is fired", done => {
      instrumentation = new BrowserNavigationInstrumentation({
        enabled: false,
      });

      const spy = sandbox.spy(document, 'addEventListener');
      // instrumentation.enable();
      instrumentation.enable();

      setTimeout(() => {
        assert.ok(spy.calledOnce);

        document.dispatchEvent(new Event('DOMContentLoaded'));

        assert.strictEqual(exporter.getFinishedLogRecords().length, 1);

        const navLogRecord =
          exporter.getFinishedLogRecords()[0] as ReadableLogRecord;
        assert.strictEqual(navLogRecord.eventName, EVENT_NAME);
        // URL should be sanitized but documentURI typically doesn't have credentials
        const expectedUrl = document.documentURI as string;
        assert.deepEqual(navLogRecord.attributes, {
          [ATTR_URL_FULL]: expectedUrl,
          [ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT]: false,
          [ATTR_BROWSER_NAVIGATION_HASH_CHANGE]: false,
        });
        done();
      });
    });

    it('should export LogRecord for browser.navigation with type push when history.pushState() is called', done => {
      const vpStartTime = 16842729000 * 1000000;

      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
        applyCustomLogRecordData: logRecord => {
          if (!logRecord.attributes) {
            (logRecord as any).attributes = {};
          }
          (logRecord.attributes as any)['vp.startTime'] = vpStartTime;
        },
      });

      history.pushState({}, '', '/dummy1.html');
      assert.strictEqual(exporter.getFinishedLogRecords().length, 1);

      const navLogRecord =
        exporter.getFinishedLogRecords()[0] as any as ReadableLogRecord;
      assert.strictEqual(navLogRecord.eventName, EVENT_NAME);
      // URL should be sanitized - check it matches current location
      const actualUrl = (navLogRecord.attributes as any)[ATTR_URL_FULL];
      assert.ok(
        actualUrl.includes(window.location.pathname),
        `Expected URL to contain pathname ${window.location.pathname}, got ${actualUrl}`
      );
      assert.strictEqual(
        (navLogRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT],
        true
      );
      assert.strictEqual(
        (navLogRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_HASH_CHANGE],
        false
      );
      assert.strictEqual(
        (navLogRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_HASH_TYPE],
        'push'
      );
      assert.strictEqual(
        (navLogRecord.attributes as any)['vp.startTime'],
        vpStartTime
      );
      done();
    });

    it('should export LogRecord for browser.navigation with type replace when history.replaceState() is called', done => {
      const vpStartTime = 16842729000 * 1000000;

      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
        applyCustomLogRecordData: logRecord => {
          if (!logRecord.attributes) {
            (logRecord as any).attributes = {};
          }
          (logRecord.attributes as any)['vp.startTime'] = vpStartTime;
        },
      });

      history.replaceState({}, '', '/dummy2.html');

      assert.strictEqual(exporter.getFinishedLogRecords().length, 1);

      const navLogRecord =
        exporter.getFinishedLogRecords()[0] as ReadableLogRecord;
      assert.strictEqual(navLogRecord.eventName, EVENT_NAME);
      // URL should be sanitized - check it matches current location
      const actualUrl = (navLogRecord.attributes as any)[ATTR_URL_FULL];
      assert.ok(
        actualUrl.includes(window.location.pathname),
        `Expected URL to contain pathname ${window.location.pathname}, got ${actualUrl}`
      );
      assert.strictEqual(
        (navLogRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT],
        true
      );
      assert.strictEqual(
        (navLogRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_HASH_CHANGE],
        false
      );
      assert.strictEqual(
        (navLogRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_HASH_TYPE],
        'replace'
      );
      assert.strictEqual(
        (navLogRecord.attributes as any)['vp.startTime'],
        vpStartTime
      );
      done();
    });

    it('should not export LogRecord for browser.navigation if the URL is not changed.', done => {
      const vpStartTime = 16842729000 * 1000000;

      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
        applyCustomLogRecordData: logRecord => {
          if (!logRecord.attributes) {
            (logRecord as any).attributes = {};
          }
          (logRecord.attributes as any)['vp.startTime'] = vpStartTime;
        },
      });

      // previously captured referrer is no longer asserted
      history.pushState({}, '', '/dummy3.html');
      assert.strictEqual(exporter.getFinishedLogRecords().length, 1);

      const navLogRecord =
        exporter.getFinishedLogRecords()[0] as any as ReadableLogRecord;
      assert.strictEqual(navLogRecord.eventName, EVENT_NAME);
      // URL should be sanitized - check it matches current location
      const actualUrl = (navLogRecord.attributes as any)[ATTR_URL_FULL];
      assert.ok(
        actualUrl.includes(window.location.pathname),
        `Expected URL to contain pathname ${window.location.pathname}, got ${actualUrl}`
      );
      assert.strictEqual(
        (navLogRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT],
        true
      );
      assert.strictEqual(
        (navLogRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_HASH_CHANGE],
        false
      );

      // previously captured second referrer is no longer asserted
      history.pushState({}, '', '/dummy3.html');
      assert.strictEqual(exporter.getFinishedLogRecords().length, 1);

      const navLogRecord2 =
        exporter.getFinishedLogRecords()[0] as any as ReadableLogRecord;
      assert.strictEqual(navLogRecord2.eventName, EVENT_NAME);
      // URL should be sanitized - check it matches current location
      const actualUrl2 = (navLogRecord2.attributes as any)[ATTR_URL_FULL];
      assert.ok(
        actualUrl2.includes(window.location.pathname),
        `Expected URL to contain pathname ${window.location.pathname}, got ${actualUrl2}`
      );
      assert.strictEqual(
        (navLogRecord2.attributes as any)[
          ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT
        ],
        true
      );
      assert.strictEqual(
        (navLogRecord2.attributes as any)[ATTR_BROWSER_NAVIGATION_HASH_CHANGE],
        false
      );

      done();
    });

    it('should export LogRecord with hash_change=true when location.hash changes', done => {
      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
      });
      instrumentation.enable();

      // Clear any existing records and set up initial state
      exporter.reset();

      const newHash = `#hash-${Date.now()}`;

      // Wait for hashchange event and check for records with hash_change=true
      const checkForHashChangeRecord = () => {
        const records = exporter.getFinishedLogRecords();
        // Look for a record with hash_change=true (regardless of type)
        const hashChangeRecord = records.find(
          record =>
            (record.attributes as any)[ATTR_BROWSER_NAVIGATION_HASH_CHANGE] ===
            true
        );

        if (hashChangeRecord) {
          assert.strictEqual(hashChangeRecord.eventName, EVENT_NAME);
          assert.strictEqual(
            (hashChangeRecord.attributes as any)[
              ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT
            ],
            true
          );
          assert.strictEqual(
            (hashChangeRecord.attributes as any)[
              ATTR_BROWSER_NAVIGATION_HASH_CHANGE
            ],
            true
          );
          // Accept either 'push' or 'traverse' as browsers may vary
          const navType = (hashChangeRecord.attributes as any)[
            ATTR_BROWSER_NAVIGATION_HASH_TYPE
          ];
          assert.ok(
            navType === 'push' || navType === 'traverse',
            `Expected navigation type to be 'push' or 'traverse', got '${navType}'`
          );
          done();
        } else {
          // Keep checking for up to 100ms
          setTimeout(checkForHashChangeRecord, 10);
        }
      };

      // Trigger hash change and start checking
      location.hash = newHash;
      setTimeout(checkForHashChangeRecord, 10);
    });

    it('should export LogRecord with type traverse when history.back() triggers a popstate', done => {
      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
      });
      instrumentation.enable();

      // Setup history stack
      history.pushState({}, '', '/nav-traverse-1');
      history.pushState({}, '', '/nav-traverse-2');

      // Clear records and set up state
      exporter.reset();

      // Listen for popstate event directly
      const popstateHandler = () => {
        setTimeout(() => {
          const records = exporter.getFinishedLogRecords();
          if (records.length === 0) {
            done(new Error('No records found after popstate'));
            return;
          }
          const navLogRecord = records.slice(-1)[0] as ReadableLogRecord;
          assert.strictEqual(navLogRecord.eventName, EVENT_NAME);
          assert.strictEqual(
            (navLogRecord.attributes as any)[
              ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT
            ],
            true
          );
          assert.strictEqual(
            (navLogRecord.attributes as any)[
              ATTR_BROWSER_NAVIGATION_HASH_CHANGE
            ],
            false
          );
          assert.strictEqual(
            (navLogRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_HASH_TYPE],
            'traverse'
          );
          window.removeEventListener('popstate', popstateHandler);
          done();
        }, 10);
      };

      window.addEventListener('popstate', popstateHandler);
      history.back();
    });

    it('should export LogRecord when Navigation API navigate event is fired (if available)', done => {
      // Check if Navigation API is actually available in the test environment
      if (!(window as any).navigation) {
        console.log(
          'Navigation API not available in test environment, skipping test'
        );
        done();
        return;
      }

      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
        useNavigationApiIfAvailable: true,
      });
      instrumentation.enable();

      // Clear any existing records
      exporter.reset();

      // Use actual Navigation API if available
      const navigation = (window as any).navigation;
      let navigateHandler: ((event: any) => void) | null = null;

      const cleanup = () => {
        if (navigateHandler && navigation) {
          navigation.removeEventListener('navigate', navigateHandler);
        }
      };

      navigateHandler = (event: any) => {
        // Let the navigation complete, then check records
        setTimeout(() => {
          const records = exporter.getFinishedLogRecords();
          if (records.length >= 1) {
            const navLogRecord = records.slice(-1)[0] as ReadableLogRecord;
            assert.strictEqual(navLogRecord.eventName, EVENT_NAME);
            assert.strictEqual(
              (navLogRecord.attributes as any)[
                ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT
              ],
              event.destination?.sameDocument ?? true
            );
            assert.strictEqual(
              (navLogRecord.attributes as any)[
                ATTR_BROWSER_NAVIGATION_HASH_CHANGE
              ],
              event.hashChange ?? false
            );
            cleanup();
            done();
          }
        }, 10);
      };

      navigation.addEventListener('navigate', navigateHandler);

      // Trigger a navigation that should fire the navigate event
      try {
        // Use navigation.navigate() with relative URL to avoid page reload
        if (navigation.navigate) {
          // Prevent actual navigation to avoid page reload
          const interceptHandler = (event: any) => {
            event.preventDefault();
          };
          navigation.addEventListener('navigate', interceptHandler, {
            once: true,
          });
          navigation.navigate('?test=nav-api');
        } else {
          history.pushState({}, '', '?test=nav-api');
          // Manually trigger if navigate() not available
          setTimeout(() => {
            const records = exporter.getFinishedLogRecords();
            if (records.length >= 1) {
              const navLogRecord = records.slice(-1)[0] as ReadableLogRecord;
              assert.strictEqual(navLogRecord.eventName, EVENT_NAME);
              assert.strictEqual(
                (navLogRecord.attributes as any)[
                  ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT
                ],
                true
              );
              cleanup();
              done();
            }
          }, 50);
        }
      } catch (_error) {
        // Fallback if Navigation API methods fail
        console.log(
          'Navigation API methods not fully supported, using fallback'
        );
        history.pushState({}, '', '?test=fallback');
        setTimeout(() => {
          const records = exporter.getFinishedLogRecords();
          if (records.length >= 1) {
            const navLogRecord = records.slice(-1)[0] as ReadableLogRecord;
            assert.strictEqual(navLogRecord.eventName, EVENT_NAME);
            assert.strictEqual(
              (navLogRecord.attributes as any)[
                ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT
              ],
              true
            );
            cleanup();
            done();
          }
        }, 50);
      }

      // Cleanup timeout in case test hangs
      setTimeout(() => {
        cleanup();
        done(new Error('Test timeout - Navigation API event not fired'));
      }, 1000);
    });

    it('should export LogRecord with Navigation API hashChange property', done => {
      // Check if Navigation API is actually available in the test environment
      if (!(window as any).navigation) {
        console.log(
          'Navigation API not available in test environment, skipping test'
        );
        done();
        return;
      }

      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
        useNavigationApiIfAvailable: true,
      });
      instrumentation.enable();

      // Clear any existing records
      exporter.reset();

      const navigation = (window as any).navigation;
      let navigateHandler: ((event: any) => void) | null = null;

      const cleanup = () => {
        if (navigateHandler && navigation) {
          navigation.removeEventListener('navigate', navigateHandler);
        }
      };

      navigateHandler = (event: any) => {
        // Check if this is a hash change navigation
        if (event.hashChange) {
          setTimeout(() => {
            const records = exporter.getFinishedLogRecords();
            if (records.length >= 1) {
              const navLogRecord = records.slice(-1)[0] as ReadableLogRecord;
              assert.strictEqual(navLogRecord.eventName, EVENT_NAME);
              assert.strictEqual(
                (navLogRecord.attributes as any)[
                  ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT
                ],
                true
              );
              assert.strictEqual(
                (navLogRecord.attributes as any)[
                  ATTR_BROWSER_NAVIGATION_HASH_CHANGE
                ],
                true
              );
              assert.strictEqual(
                (navLogRecord.attributes as any)[
                  ATTR_BROWSER_NAVIGATION_HASH_TYPE
                ],
                'push'
              );
              cleanup();
              done();
            }
          }, 10);
        }
      };

      navigation.addEventListener('navigate', navigateHandler);

      // Trigger a hash navigation
      try {
        if (navigation.navigate) {
          // Prevent actual navigation to avoid page reload
          const interceptHandler = (event: any) => {
            event.preventDefault();
          };
          navigation.addEventListener('navigate', interceptHandler, {
            once: true,
          });
          navigation.navigate('#section1');
        } else {
          // Fallback to traditional hash change
          location.hash = '#section1';
          setTimeout(() => {
            const records = exporter.getFinishedLogRecords();
            if (records.length >= 1) {
              const navLogRecord = records.slice(-1)[0] as ReadableLogRecord;
              assert.strictEqual(navLogRecord.eventName, EVENT_NAME);
              assert.strictEqual(
                (navLogRecord.attributes as any)[
                  ATTR_BROWSER_NAVIGATION_HASH_CHANGE
                ],
                true
              );
              cleanup();
              done();
            }
          }, 50);
        }
      } catch (_error) {
        // Fallback to traditional hash change
        location.hash = '#section1';
        setTimeout(() => {
          const records = exporter.getFinishedLogRecords();
          if (records.length >= 1) {
            const navLogRecord = records.slice(-1)[0] as ReadableLogRecord;
            assert.strictEqual(navLogRecord.eventName, EVENT_NAME);
            assert.strictEqual(
              (navLogRecord.attributes as any)[
                ATTR_BROWSER_NAVIGATION_HASH_CHANGE
              ],
              true
            );
            cleanup();
            done();
          }
        }, 50);
      }

      // Cleanup timeout
      setTimeout(() => {
        cleanup();
        done(new Error('Test timeout - Hash change navigation not detected'));
      }, 1000);
    });

    it('should sanitize URLs with credentials', done => {
      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
      });

      // Test the sanitization method directly
      const testUrl =
        'https://user:password@example.com/path?api_key=secret123&normal=value';
      const sanitized = (instrumentation as any)._sanitizeUrl(testUrl);

      assert.ok(
        sanitized.includes('REDACTED:REDACTED@'),
        'Should redact credentials'
      );
      assert.ok(
        sanitized.includes('api_key=REDACTED'),
        'Should redact sensitive query params'
      );
      assert.ok(
        sanitized.includes('normal=value'),
        'Should preserve normal query params'
      );
      done();
    });

    it('should work with Navigation API disabled', done => {
      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
        useNavigationApiIfAvailable: false,
      });
      instrumentation.enable();

      // Clear any existing records and set baseline
      exporter.reset();

      // Trigger a navigation using history API
      history.pushState({}, '', '/fallback-test');

      setTimeout(() => {
        const records = exporter.getFinishedLogRecords();
        // Should have at least one record (may have more due to test environment)
        assert.ok(
          records.length >= 1,
          'Should have at least one navigation record'
        );

        // Find our test record
        const testRecord = records.find(r =>
          (r.attributes as any)['url.full']?.includes('/fallback-test')
        );

        assert.ok(testRecord, 'Should find navigation record for our test URL');
        assert.strictEqual(testRecord.eventName, EVENT_NAME);
        assert.strictEqual(
          (testRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_HASH_TYPE],
          'push'
        );
        assert.strictEqual(
          (testRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT],
          true
        );

        done();
      }, 10);
    });

    it('should not attach Navigation API listeners when disabled', done => {
      // Skip if Navigation API is not available
      if (!(window as any).navigation) {
        done();
        return;
      }

      // Spy on Navigation API addEventListener
      const navigationSpy = sandbox.spy(
        (window as any).navigation,
        'addEventListener'
      );

      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
        useNavigationApiIfAvailable: false,
      });
      instrumentation.enable();

      // Verify Navigation API addEventListener was not called for 'navigate' events
      const navigateListenerCalls = navigationSpy
        .getCalls()
        .filter(call => call.args[0] === 'navigate');
      assert.strictEqual(
        navigateListenerCalls.length,
        0,
        'Navigation API should not be used when disabled'
      );

      done();
    });
  });
});
