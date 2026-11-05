/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import type { TLSSocket } from 'tls';
import {
  ATTR_TLS_CIPHER,
  ATTR_TLS_ESTABLISHED,
  ATTR_TLS_PROTOCOL_NAME,
  ATTR_TLS_PROTOCOL_VERSION,
  ATTR_TLS_SERVER_HASH_SHA1,
  ATTR_TLS_SERVER_HASH_SHA256,
  ATTR_TLS_SERVER_NOT_AFTER,
  ATTR_TLS_SERVER_NOT_BEFORE,
} from '../src/semconv';
import { getTLSAttributes, getTLSProtocolAttributes } from '../src/utils';

function stubSocket(overrides: Partial<Record<string, unknown>>): TLSSocket {
  return {
    getProtocol: () => 'TLSv1.3',
    getCipher: () => ({ standardName: 'TLS_AES_256_GCM_SHA384' }),
    getPeerCertificate: () => ({}),
    alpnProtocol: false,
    ...overrides,
  } as unknown as TLSSocket;
}

describe('utils', () => {
  describe('getTLSProtocolAttributes', () => {
    const cases: [string | null, Record<string, string>][] = [
      [
        'TLSv1.3',
        { [ATTR_TLS_PROTOCOL_NAME]: 'tls', [ATTR_TLS_PROTOCOL_VERSION]: '1.3' },
      ],
      [
        'TLSv1',
        { [ATTR_TLS_PROTOCOL_NAME]: 'tls', [ATTR_TLS_PROTOCOL_VERSION]: '1' },
      ],
      [
        'SSLv3',
        { [ATTR_TLS_PROTOCOL_NAME]: 'ssl', [ATTR_TLS_PROTOCOL_VERSION]: '3' },
      ],
      ['unknown', {}],
      [null, {}],
    ];

    for (const [protocol, expected] of cases) {
      it(`should parse ${JSON.stringify(protocol)}`, () => {
        assert.deepStrictEqual(getTLSProtocolAttributes(protocol), expected);
      });
    }
  });

  describe('getTLSAttributes', () => {
    it('should omit server certificate attributes when there is no peer certificate', () => {
      // e.g. PSK ciphers or a resumed TLS 1.2 session
      assert.deepStrictEqual(getTLSAttributes(stubSocket({})), {
        [ATTR_TLS_ESTABLISHED]: true,
        [ATTR_TLS_PROTOCOL_NAME]: 'tls',
        [ATTR_TLS_PROTOCOL_VERSION]: '1.3',
        [ATTR_TLS_CIPHER]: 'TLS_AES_256_GCM_SHA384',
      });
    });

    it('should not throw when socket details are no longer available', () => {
      const socket = stubSocket({
        getProtocol: () => null,
        getCipher: () => null,
        getPeerCertificate: () => null,
      });
      assert.deepStrictEqual(getTLSAttributes(socket), {
        [ATTR_TLS_ESTABLISHED]: true,
      });
    });

    it('should skip certificate dates that cannot be parsed', () => {
      const socket = stubSocket({
        getPeerCertificate: () => ({
          fingerprint: 'AB:CD',
          fingerprint256: 'ab:cd:ef',
          valid_from: 'not a date',
          valid_to: 'Jan  1 00:00:00 2030 GMT',
        }),
      });
      const attributes = getTLSAttributes(socket);
      assert.strictEqual(attributes[ATTR_TLS_SERVER_HASH_SHA1], 'ABCD');
      assert.strictEqual(attributes[ATTR_TLS_SERVER_HASH_SHA256], 'ABCDEF');
      assert.strictEqual(attributes[ATTR_TLS_SERVER_NOT_BEFORE], undefined);
      assert.strictEqual(
        attributes[ATTR_TLS_SERVER_NOT_AFTER],
        '2030-01-01T00:00:00.000Z'
      );
    });
  });
});
