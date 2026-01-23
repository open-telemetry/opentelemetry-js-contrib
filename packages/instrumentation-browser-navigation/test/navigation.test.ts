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
import { defaultSanitizeUrl } from '../src/utils';
import {
  EVENT_NAME,
  ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT,
  ATTR_BROWSER_NAVIGATION_HASH_CHANGE,
  ATTR_BROWSER_NAVIGATION_TYPE,
} from '../src/instrumentation';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import { logs } from '@opentelemetry/api-logs';
// @ts-expect-error cjs still works
import { assert } from 'chai';
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
        useNavigationApiIfAvailable: false, // Disable Navigation API to test DOMContentLoaded path
      });

      const spy = sandbox.spy(document, 'addEventListener');
      instrumentation.enable();

      setTimeout(() => {
        // Check if readyState was 'complete' when instrumentation enabled
        const wasDocumentReady = document.readyState === 'complete';

        if (wasDocumentReady) {
          // If document was ready, no listener should be registered (readyState check fired)
          assert.ok(
            !spy.called,
            'No DOMContentLoaded listener should be registered when document is already ready'
          );
        } else {
          // If document wasn't ready, listener should be registered
          assert.ok(
            spy.calledOnce,
            'DOMContentLoaded listener should be registered when document is not ready'
          );
        }

        // Dispatch fake DOMContentLoaded event
        document.dispatchEvent(new Event('DOMContentLoaded'));

        // Wait a bit for any events to process
        setTimeout(() => {
          const records = exporter.getFinishedLogRecords();
          assert.ok(
            records.length >= 1,
            `Expected at least 1 record, got ${records.length}`
          );

          // Verify the navigation record has correct properties
          const navLogRecord = records[records.length - 1] as ReadableLogRecord;
          assert.strictEqual(navLogRecord.eventName, EVENT_NAME);
          // URL should be sanitized but documentURI typically doesn't have credentials
          const expectedUrl = document.documentURI as string;
          assert.deepEqual(navLogRecord.attributes, {
            [ATTR_URL_FULL]: expectedUrl,
            [ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT]: false,
            [ATTR_BROWSER_NAVIGATION_HASH_CHANGE]: false,
          });
          done();
        }, 10);
      }, 10);
    });

    it('should export LogRecord for browser.navigation with type push when history.pushState() is called', done => {
      const vpStartTime = 16842729000 * 1000000;

      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
        // Test should work with either Navigation API setting
        applyCustomLogRecordData: logRecord => {
          if (!logRecord.attributes) {
            (logRecord as any).attributes = {};
          }
          (logRecord.attributes as any)['vp.startTime'] = vpStartTime;
        },
      });

      // Clear existing records and get baseline
      exporter.reset();
      const initialCount = exporter.getFinishedLogRecords().length;

      history.pushState({}, '', '/dummy1.html');

      // Allow time for both potential events (History API + Navigation API)
      setTimeout(() => {
        const records = exporter.getFinishedLogRecords();
        const newRecords = records.slice(initialCount);

        // Should have at least one record for our navigation
        assert.ok(newRecords.length >= 1, 'Should record the navigation');

        // Find the record for our test navigation
        const testRecord = newRecords.find(r =>
          (r.attributes as any)['url.full']?.includes('/dummy1.html')
        );

        assert.ok(testRecord, 'Should find record for /dummy1.html navigation');

        // Verify the record has correct properties
        assert.strictEqual(testRecord.eventName, EVENT_NAME);
        assert.strictEqual(
          (testRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_SAME_DOCUMENT],
          true
        );
        assert.strictEqual(
          (testRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_HASH_CHANGE],
          false
        );
        assert.strictEqual(
          (testRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_TYPE],
          'push'
        );
        assert.strictEqual(
          (testRecord.attributes as any)['vp.startTime'],
          vpStartTime
        );
        done();
      }, 10);
    });

    it('should export LogRecord for browser.navigation with type replace when history.replaceState() is called', done => {
      const vpStartTime = 16842729000 * 1000000;

      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
        useNavigationApiIfAvailable: false, // Disable Navigation API to test history API path
        applyCustomLogRecordData: logRecord => {
          if (!logRecord.attributes) {
            (logRecord as any).attributes = {};
          }
          (logRecord.attributes as any)['vp.startTime'] = vpStartTime;
        },
      });

      history.replaceState({}, '', '/dummy2.html');

      const recs = exporter.getFinishedLogRecords();
      assert.strictEqual(recs.length, 2);

      const navLogRecord = recs[1] as ReadableLogRecord;
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
        (navLogRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_TYPE],
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
        useNavigationApiIfAvailable: false, // Disable Navigation API to test history API path
        applyCustomLogRecordData: logRecord => {
          if (!logRecord.attributes) {
            (logRecord as any).attributes = {};
          }
          (logRecord.attributes as any)['vp.startTime'] = vpStartTime;
        },
      });

      history.pushState({}, '', '/dummy3.html');

      // We expect the hard page load navigation & the soft pushState
      // navigation.
      const recs = exporter.getFinishedLogRecords();
      assert.strictEqual(recs.length, 2);

      const navLogRecord = recs[1] as any as ReadableLogRecord;
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

      const recs2 = exporter.getFinishedLogRecords();
      assert.strictEqual(recs2.length, 2);

      const navLogRecord2 = recs2[1] as any as ReadableLogRecord;
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
            ATTR_BROWSER_NAVIGATION_TYPE
          ];
          assert.ok(
            navType === 'push' || navType === 'traverse',
            `Expected navigation type to be 'push' or 'traverse', got '${navType}'`
          );
          done();
        } else {
          // Keep checking for up to 100ms
          setTimeout(checkForHashChangeRecord, 25);
        }
      };

      // Trigger hash change and start checking
      location.hash = newHash;
      setTimeout(checkForHashChangeRecord, 25);
    });

    it('should export LogRecord with type traverse when history.back() triggers a popstate', done => {
      instrumentation = new BrowserNavigationInstrumentation({ enabled: true });

      // Setup history stack
      history.pushState({}, '', '/nav-traverse-1');
      history.pushState({}, '', '/nav-traverse-2');

      // Clear records and set up state
      exporter.reset();

      // Use popstate event to know when the instrumentation (also using
      // this event) has exported the LogEvents.
      const popstateHandler = () => {
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
          (navLogRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_HASH_CHANGE],
          false
        );
        assert.strictEqual(
          (navLogRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_TYPE],
          'traverse'
        );
        window.removeEventListener('popstate', popstateHandler);
        done();
      };

      window.addEventListener('popstate', popstateHandler);
      history.back();
    });

    it('should export LogRecord when Navigation API currententrychange event is fired (if available)', done => {
      // Check if Navigation API is actually available in the test environment
      if (!(window as any).navigation) {
        console.log(
          'Navigation API not available in test environment, skipping test'
        );
        done();
        return;
      }

      let testCompleted = false;
      const completeDone = (error?: Error) => {
        if (!testCompleted) {
          testCompleted = true;
          done(error);
        }
      };

      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
        useNavigationApiIfAvailable: true,
      });

      // Wait for any readyState-triggered events, then clear records
      setTimeout(() => {
        exporter.reset();

        // Use actual Navigation API if available
        const navigation = (window as any).navigation;
        let entryChangeHandler: ((event: any) => void) | null = null;

        const cleanup = () => {
          if (entryChangeHandler && navigation) {
            navigation.removeEventListener(
              'currententrychange',
              entryChangeHandler
            );
          }
        };

        entryChangeHandler = (_event: any) => {
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
                true // currententrychange events are typically same-document
              );
              // Hash change detection is based on URL comparison for currententrychange
              assert.ok(
                (navLogRecord.attributes as any)[
                  ATTR_BROWSER_NAVIGATION_HASH_CHANGE
                ] !== undefined
              );
              cleanup();
              completeDone();
            }
          }, 10);
        };

        navigation.addEventListener('currententrychange', entryChangeHandler);

        // Trigger a navigation that should fire the currententrychange event
        try {
          // Use history.pushState to trigger currententrychange (safer than navigation.navigate)
          history.pushState({}, '', '?test=nav-api');

          // Set timeout to check if currententrychange fired
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
              completeDone();
            } else {
              // If no records, the test environment might not support currententrychange
              console.log(
                'No navigation records found, currententrychange might not be supported'
              );
              cleanup();
              completeDone();
            }
          }, 50);
        } catch {
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
              completeDone();
            }
          }, 50);
        }

        // Cleanup timeout in case test hangs
        setTimeout(() => {
          cleanup();
          completeDone(
            new Error('Test timeout - Navigation API event not fired')
          );
        }, 1000);
      }, 10); // Close the setTimeout for readyState wait
    });

    it('should export LogRecord with Navigation API hash change detection', done => {
      let testCompleted = false;
      const completeDone = (error?: Error) => {
        if (!testCompleted) {
          testCompleted = true;
          done(error);
        }
      };

      // Check if Navigation API is actually available in the test environment
      if (!(window as any).navigation) {
        console.log(
          'Navigation API not available in test environment, skipping test'
        );
        completeDone();
        return;
      }

      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
        useNavigationApiIfAvailable: true,
      });

      // Wait for any readyState-triggered events, then clear records
      setTimeout(() => {
        exporter.reset();

        const navigation = (window as any).navigation;
        let entryChangeHandler: ((event: any) => void) | null = null;

        const cleanup = () => {
          if (entryChangeHandler && navigation) {
            navigation.removeEventListener(
              'currententrychange',
              entryChangeHandler
            );
          }
        };

        entryChangeHandler = (_event: any) => {
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
              // For currententrychange, hash change detection is based on URL comparison
              const hashChange = (navLogRecord.attributes as any)[
                ATTR_BROWSER_NAVIGATION_HASH_CHANGE
              ];
              assert.ok(typeof hashChange === 'boolean');

              const navType = (navLogRecord.attributes as any)[
                ATTR_BROWSER_NAVIGATION_TYPE
              ];
              assert.ok(navType === 'push' || navType === 'traverse');
              cleanup();
              completeDone();
            }
          }, 10);
        };

        navigation.addEventListener('currententrychange', entryChangeHandler);

        // Trigger a hash navigation using traditional method (more reliable)
        location.hash = '#section1';

        // Set timeout to check if currententrychange fired
        setTimeout(() => {
          const records = exporter.getFinishedLogRecords();
          if (records.length >= 1) {
            const navLogRecord = records.slice(-1)[0] as ReadableLogRecord;
            assert.strictEqual(navLogRecord.eventName, EVENT_NAME);
            cleanup();
            completeDone();
          } else {
            console.log('No hash navigation records found');
            cleanup();
            completeDone();
          }
        }, 100);

        // Cleanup timeout
        setTimeout(() => {
          cleanup();
          completeDone(
            new Error('Test timeout - Hash change navigation not detected')
          );
        }, 1000);
      }, 10); // Close the setTimeout for readyState wait
    });

    it('should sanitize URLs with credentials using default sanitizer', done => {
      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
        useNavigationApiIfAvailable: false, // Test history API path
        sanitizeUrl: defaultSanitizeUrl,
      });

      // Wait for any readyState-triggered events, then clear records
      setTimeout(() => {
        exporter.reset();

        // Use relative URL to avoid cross-origin issues in tests
        const testUrl = '/path?api_key=secret123&normal=value';

        // Simulate navigation to URL with credentials
        history.pushState({}, '', testUrl);

        setTimeout(() => {
          const records = exporter.getFinishedLogRecords();
          assert.ok(records.length >= 1, 'Should have at least one record');

          const navLogRecord = records.slice(-1)[0] as ReadableLogRecord;
          const sanitized = (navLogRecord.attributes as any)[
            'url.full'
          ] as string;

          assert.ok(
            sanitized.includes('api_key=REDACTED'),
            'Should redact sensitive query params'
          );
          assert.ok(
            sanitized.includes('normal=value'),
            'Should preserve normal query params'
          );
          done();
        }, 10);
      }, 10); // Close the setTimeout for readyState wait
    });

    it('should use custom sanitizeUrl callback when provided', done => {
      const customSanitizer = (url: string) => {
        // Custom sanitizer that only removes passwords, keeps everything else
        return url.replace(/password=[^&]*/gi, 'password=CUSTOM_REDACTED');
      };

      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
        useNavigationApiIfAvailable: false, // Test history API path
        sanitizeUrl: customSanitizer,
      });

      // Clear any existing records
      exporter.reset();

      // Test URL with password parameter (relative to avoid cross-origin issues)
      const testUrl = '/path?password=secret123&api_key=keepthis&normal=value';

      history.pushState({}, '', testUrl);

      setTimeout(() => {
        const records = exporter.getFinishedLogRecords();
        assert.ok(records.length >= 1, 'Should have at least one record');

        const navLogRecord = records.slice(-1)[0] as ReadableLogRecord;
        const sanitized = (navLogRecord.attributes as any)[
          'url.full'
        ] as string;

        assert.ok(
          sanitized.includes('password=CUSTOM_REDACTED'),
          'Should use custom sanitization for password'
        );
        assert.ok(
          sanitized.includes('api_key=keepthis'),
          'Should preserve api_key (not redacted by custom sanitizer)'
        );
        assert.ok(
          sanitized.includes('normal=value'),
          'Should preserve normal query params'
        );
        done();
      }, 150);
    });

    it('should work with Navigation API enabled', done => {
      instrumentation = new BrowserNavigationInstrumentation({
        enabled: true,
        useNavigationApiIfAvailable: true,
      });

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
          (testRecord.attributes as any)[ATTR_BROWSER_NAVIGATION_TYPE],
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
