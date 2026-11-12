/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-expect-error TS1479: chai v6 is ESM-only; the CJS build flags it, but browser tests load it as ESM
import { assert } from 'chai';
import { redactQueryString, redactUrl } from '../src/redact-url';

describe('redactUrl', () => {
  describe('query string', () => {
    it('redacts every key from the semantic conventions list', () => {
      const keys = [
        'sig',
        'Signature',
        'AWSAccessKeyId',
        'X-Goog-Signature',
        'X-Amz-Signature',
        'X-Amz-Credential',
        'X-Amz-Security-Token',
      ];
      for (const key of keys) {
        assert.strictEqual(
          redactUrl(`https://example.com/p?${key}=secret&keep=1`),
          `https://example.com/p?${key}=REDACTED&keep=1`,
          key
        );
      }
    });

    it('redacts a presigned S3 URL', () => {
      assert.strictEqual(
        redactUrl(
          'https://bucket.s3.amazonaws.com/key?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
            '&X-Amz-Credential=AKIA%2F20261111%2Fus-east-1%2Fs3%2Faws4_request' +
            '&X-Amz-Date=20261111T000000Z&X-Amz-Expires=900' +
            '&X-Amz-Security-Token=token&X-Amz-Signature=abcdef'
        ),
        'https://bucket.s3.amazonaws.com/key?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
          '&X-Amz-Credential=REDACTED' +
          '&X-Amz-Date=20261111T000000Z&X-Amz-Expires=900' +
          '&X-Amz-Security-Token=REDACTED&X-Amz-Signature=REDACTED'
      );
    });

    it('redacts an Azure SAS URL', () => {
      assert.strictEqual(
        redactUrl(
          'https://acct.blob.core.windows.net/c/b?sv=2022-11-02&sp=r&sig=abc%3D'
        ),
        'https://acct.blob.core.windows.net/c/b?sv=2022-11-02&sp=r&sig=REDACTED'
      );
    });

    it('redacts every occurrence of a repeated key', () => {
      assert.strictEqual(
        redactUrl('https://example.com/?sig=a&sig=b'),
        'https://example.com/?sig=REDACTED&sig=REDACTED'
      );
    });

    it('redacts keys without a value', () => {
      assert.strictEqual(
        redactUrl('https://example.com/?sig&a=1'),
        'https://example.com/?sig=REDACTED&a=1'
      );
    });

    it('matches percent-encoded keys', () => {
      assert.strictEqual(
        redactUrl('https://example.com/?X%2DAmz%2DSignature=s'),
        'https://example.com/?X%2DAmz%2DSignature=REDACTED'
      );
    });

    it('matches keys case-sensitively', () => {
      const url = 'https://example.com/?SIG=1&signature=2&x-amz-signature=3';
      assert.strictEqual(redactUrl(url), url);
    });

    it('keeps the fragment', () => {
      assert.strictEqual(
        redactUrl('https://example.com/p?sig=1#frag'),
        'https://example.com/p?sig=REDACTED#frag'
      );
    });

    it('does not treat a "?" inside the fragment as a query string', () => {
      const url = 'https://example.com/p#frag?sig=1';
      assert.strictEqual(redactUrl(url), url);
    });

    it('works on relative URLs', () => {
      assert.strictEqual(
        redactUrl('/path?sig=secret&ok=1'),
        '/path?sig=REDACTED&ok=1'
      );
    });

    it('keeps malformed percent-encoding intact', () => {
      assert.strictEqual(
        redactUrl('https://example.com/?%E0%A4%A=1&sig=2'),
        'https://example.com/?%E0%A4%A=1&sig=REDACTED'
      );
    });
  });

  describe('credentials', () => {
    it('redacts username and password', () => {
      assert.strictEqual(
        redactUrl('https://user:pass@example.com/p?a=1'),
        'https://REDACTED:REDACTED@example.com/p?a=1'
      );
    });

    it('redacts a username without password', () => {
      assert.strictEqual(
        redactUrl('https://user@example.com/'),
        'https://REDACTED:REDACTED@example.com/'
      );
    });

    it('redacts credentials in protocol-relative URLs', () => {
      assert.strictEqual(
        redactUrl('//user:pass@example.com/p'),
        '//REDACTED:REDACTED@example.com/p'
      );
    });

    it('redacts credentials and query string together', () => {
      assert.strictEqual(
        redactUrl('https://user:pass@example.com/p?sig=1'),
        'https://REDACTED:REDACTED@example.com/p?sig=REDACTED'
      );
    });

    it('does not treat "@" in the path as credentials', () => {
      const url = 'https://example.com/a//b@c';
      assert.strictEqual(redactUrl(url), url);
    });
  });

  describe('unchanged URLs', () => {
    it('returns URLs with nothing to redact byte-for-byte', () => {
      const urls = [
        'https://example.com',
        'https://example.com/p?q=%E2%9C%93&x=1',
        'https://example.com/p?a=1&&b=2&',
        'https://example.com/?',
        '/relative/path',
        '',
        'not a url',
      ];
      for (const url of urls) {
        assert.strictEqual(redactUrl(url), url);
      }
    });
  });

  describe('malicious input', () => {
    // These inputs target the regex and the query parsing. Each one has to
    // finish in linear time, so 1MB should take well under a second.
    const n = 1_000_000;
    const inputs: Record<string, string> = {
      'long scheme without ":"': 'a'.repeat(n) + '/',
      'long scheme without "//"': 'a'.repeat(n) + ':/',
      'long authority': '//' + 'x'.repeat(n),
      'many "@"': 'https://' + '@'.repeat(n) + '/p',
      'many "&"': 'https://example.com/?' + '&'.repeat(n),
      'many "+" in a key': 'https://example.com/?' + '+'.repeat(n) + '=1',
      'many pairs': 'https://example.com/?' + 'sig=1&'.repeat(n / 6),
    };
    for (const [name, input] of Object.entries(inputs)) {
      it(`handles ${name} in linear time`, () => {
        const start = Date.now();
        redactUrl(input);
        assert.ok(Date.now() - start < 1000, `${name} took too long`);
      });
    }
  });
});

describe('redactQueryString', () => {
  it('redacts with a leading "?"', () => {
    assert.strictEqual(redactQueryString('?sig=1&a=2'), '?sig=REDACTED&a=2');
  });

  it('redacts without a leading "?"', () => {
    assert.strictEqual(redactQueryString('sig=1&a=2'), 'sig=REDACTED&a=2');
  });

  it('returns empty query strings unchanged', () => {
    assert.strictEqual(redactQueryString(''), '');
    assert.strictEqual(redactQueryString('?'), '?');
  });

  describe('garbage input', () => {
    it('does not throw on malformed strings', () => {
      for (const value of [
        '',
        '//',
        '://',
        'http://@',
        'http://u:p@[::1',
        'http://u:p@h:99999/',
        '?%E0%A4%A&sig=1',
        '%',
      ]) {
        assert.strictEqual(typeof redactUrl(value), 'string');
      }
    });

    it('redacts credentials and signatures behind backslashes', () => {
      const result = redactUrl('http:\\\\user:pass@host/?sig=1');
      assert.ok(!result.includes('user'), result);
      assert.ok(!result.includes('pass'), result);
      assert.ok(result.includes('sig=REDACTED'), result);
    });
  });
});
