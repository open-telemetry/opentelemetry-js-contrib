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

// @ts-expect-error cjs still works
import { assert } from 'chai';
import { isHashChange, defaultSanitizeUrl } from '../src/utils';

describe('utils', () => {
  describe('isHashChange', () => {
    it('should return true when adding a hash to the same URL', () => {
      const fromUrl = 'https://example.com/page';
      const toUrl = 'https://example.com/page#section1';
      assert.strictEqual(isHashChange(fromUrl, toUrl), true);
    });

    it('should return true when changing hash on the same URL', () => {
      const fromUrl = 'https://example.com/page#section1';
      const toUrl = 'https://example.com/page#section2';
      assert.strictEqual(isHashChange(fromUrl, toUrl), true);
    });

    it('should return false when removing a hash', () => {
      const fromUrl = 'https://example.com/page#section1';
      const toUrl = 'https://example.com/page';
      assert.strictEqual(isHashChange(fromUrl, toUrl), false);
    });

    it('should return false when URLs have different paths', () => {
      const fromUrl = 'https://example.com/page1#section1';
      const toUrl = 'https://example.com/page2#section1';
      assert.strictEqual(isHashChange(fromUrl, toUrl), false);
    });

    it('should return false when URLs have different origins', () => {
      const fromUrl = 'https://example.com/page#section1';
      const toUrl = 'https://other.com/page#section2';
      assert.strictEqual(isHashChange(fromUrl, toUrl), false);
    });

    it('should return false when URLs have different query parameters', () => {
      const fromUrl = 'https://example.com/page?param=1#section1';
      const toUrl = 'https://example.com/page?param=2#section2';
      assert.strictEqual(isHashChange(fromUrl, toUrl), false);
    });

    it('should return true when only hash differs with same query parameters', () => {
      const fromUrl = 'https://example.com/page?param=1#section1';
      const toUrl = 'https://example.com/page?param=1#section2';
      assert.strictEqual(isHashChange(fromUrl, toUrl), true);
    });

    it('should return true when adding hash with query parameters', () => {
      const fromUrl = 'https://example.com/page?param=1';
      const toUrl = 'https://example.com/page?param=1#section1';
      assert.strictEqual(isHashChange(fromUrl, toUrl), true);
    });

    it('should return false when URLs are identical', () => {
      const fromUrl = 'https://example.com/page#section1';
      const toUrl = 'https://example.com/page#section1';
      assert.strictEqual(isHashChange(fromUrl, toUrl), false);
    });

    it('should return false when both URLs have no hash', () => {
      const fromUrl = 'https://example.com/page';
      const toUrl = 'https://example.com/page';
      assert.strictEqual(isHashChange(fromUrl, toUrl), false);
    });

    describe('fallback behavior with invalid URLs', () => {
      it('should handle malformed URLs in fallback mode', () => {
        const fromUrl = 'not-a-valid-url';
        const toUrl = 'not-a-valid-url#section1';
        // This should trigger the fallback logic
        assert.strictEqual(isHashChange(fromUrl, toUrl), true);
      });

      it('should return false in fallback mode when removing hash', () => {
        const fromUrl = 'invalid-url#section1';
        const toUrl = 'invalid-url';
        // Fallback mode should return false when removing hash
        assert.strictEqual(isHashChange(fromUrl, toUrl), false);
      });

      it('should handle URLs with invalid protocols in fallback mode', () => {
        const fromUrl = 'invalid://example.com/page';
        const toUrl = 'invalid://example.com/page#section1';
        // This should trigger the fallback logic and return true for adding hash
        assert.strictEqual(isHashChange(fromUrl, toUrl), true);
      });
    });

    describe('edge cases', () => {
      it('should handle empty hash correctly', () => {
        const fromUrl = 'https://example.com/page#';
        const toUrl = 'https://example.com/page#section1';
        assert.strictEqual(isHashChange(fromUrl, toUrl), true);
      });

      it('should handle URLs with ports', () => {
        const fromUrl = 'https://example.com:8080/page';
        const toUrl = 'https://example.com:8080/page#section1';
        assert.strictEqual(isHashChange(fromUrl, toUrl), true);
      });

      it('should handle URLs with different ports as different origins', () => {
        const fromUrl = 'https://example.com:8080/page#section1';
        const toUrl = 'https://example.com:9090/page#section2';
        assert.strictEqual(isHashChange(fromUrl, toUrl), false);
      });

      it('should handle complex query parameters', () => {
        const fromUrl = 'https://example.com/page?a=1&b=2&c=3';
        const toUrl = 'https://example.com/page?a=1&b=2&c=3#section1';
        assert.strictEqual(isHashChange(fromUrl, toUrl), true);
      });
    });
  });

  describe('defaultSanitizeUrl', () => {
    it('should redact username and password from URL', () => {
      const url = 'https://user:pass@example.com/path';
      const sanitized = defaultSanitizeUrl(url);
      assert.strictEqual(
        sanitized,
        'https://REDACTED:REDACTED@example.com/path'
      );
    });

    it('should redact sensitive query parameters', () => {
      const url = 'https://example.com/path?api_key=secret123&normal=value';
      const sanitized = defaultSanitizeUrl(url);
      assert.ok(sanitized.includes('api_key=REDACTED'));
      assert.ok(sanitized.includes('normal=value'));
    });

    it('should handle multiple sensitive parameters', () => {
      const url =
        'https://example.com/path?token=abc123&password=secret&normal=value';
      const sanitized = defaultSanitizeUrl(url);
      assert.ok(sanitized.includes('token=REDACTED'));
      assert.ok(sanitized.includes('password=REDACTED'));
      assert.ok(sanitized.includes('normal=value'));
    });

    it('should preserve fragment/hash in URL', () => {
      const url = 'https://example.com/path?api_key=secret#section1';
      const sanitized = defaultSanitizeUrl(url);
      assert.ok(sanitized.includes('#section1'));
      assert.ok(sanitized.includes('api_key=REDACTED'));
    });

    it('should handle invalid URLs with fallback logic', () => {
      const url = 'invalid://user:pass@example.com/path?api_key=secret123';
      const sanitized = defaultSanitizeUrl(url);
      assert.ok(sanitized.includes('REDACTED:REDACTED'));
      assert.ok(sanitized.includes('api_key=REDACTED'));
    });

    it('should return URL unchanged if no sensitive data', () => {
      const url = 'https://example.com/path?normal=value&other=data';
      const sanitized = defaultSanitizeUrl(url);
      assert.strictEqual(sanitized, url);
    });

    it('should handle URL encoded sensitive parameters', () => {
      const url = 'https://example.com/path?api%5Fkey=secret123';
      const sanitized = defaultSanitizeUrl(url);
      // This tests the fallback regex logic for URL-encoded parameters
      assert.ok(sanitized.includes('REDACTED'));
    });
  });
});
