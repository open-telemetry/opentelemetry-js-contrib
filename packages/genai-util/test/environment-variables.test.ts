/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import {
  ENV_GENAI_CAPTURE_MESSAGE_CONTENT,
  getContentCaptureMode,
  parseContentCaptureMode,
} from '../src/environment-variables';

describe('Environment Variables and Content Capture', () => {
  describe('constants', () => {
    it('should define expected environment variable names', () => {
      assert.strictEqual(
        ENV_GENAI_CAPTURE_MESSAGE_CONTENT,
        'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT'
      );
    });
  });

  describe('parseContentCaptureMode', () => {
    it('should return "none" for undefined or null', () => {
      assert.strictEqual(parseContentCaptureMode(undefined), 'none');
      assert.strictEqual(parseContentCaptureMode(null), 'none');
    });

    it('should parse span capture modes', () => {
      assert.strictEqual(parseContentCaptureMode('span_only'), 'span_only');
      assert.strictEqual(parseContentCaptureMode('SPAN_ONLY'), 'span_only');
      assert.strictEqual(parseContentCaptureMode('  span_only  '), 'span_only');
      assert.strictEqual(parseContentCaptureMode('span'), 'span_only');
      assert.strictEqual(parseContentCaptureMode('SPAN'), 'span_only');
      assert.strictEqual(parseContentCaptureMode('  span  '), 'span_only');
      assert.strictEqual(
        parseContentCaptureMode('span_and_event'),
        'span_only'
      );
      assert.strictEqual(
        parseContentCaptureMode('SPAN_AND_EVENT'),
        'span_only'
      );
      assert.strictEqual(parseContentCaptureMode('true'), 'span_only');
      assert.strictEqual(parseContentCaptureMode('TRUE'), 'span_only');
    });

    it('should parse explicit none / no content modes', () => {
      assert.strictEqual(parseContentCaptureMode('none'), 'none');
      assert.strictEqual(parseContentCaptureMode('NONE'), 'none');
      assert.strictEqual(parseContentCaptureMode('no_content'), 'none');
      assert.strictEqual(parseContentCaptureMode('NO_CONTENT'), 'none');
      assert.strictEqual(parseContentCaptureMode('false'), 'none');
      assert.strictEqual(parseContentCaptureMode('FALSE'), 'none');
      assert.strictEqual(parseContentCaptureMode(''), 'none');
      assert.strictEqual(parseContentCaptureMode('   '), 'none');
    });

    it('should warn when downgrading or ignoring unsupported values', () => {
      const warnings: string[] = [];
      const mockDiag = {
        error() {},
        warn(msg: string) {
          warnings.push(msg);
        },
        info() {},
        debug() {},
        verbose() {},
      };

      assert.strictEqual(
        parseContentCaptureMode('span_and_event', mockDiag),
        'span_only'
      );
      assert.strictEqual(
        parseContentCaptureMode('event_only', mockDiag),
        'none'
      );
      assert.strictEqual(
        parseContentCaptureMode('unknown_mode', mockDiag),
        'none'
      );
      assert.strictEqual(warnings.length, 3);
      assert.match(warnings[0], /span_and_event/);
      assert.match(warnings[1], /event_only/);
      assert.match(warnings[2], /unknown_mode/);
    });

    it('should fall back to "none" for unknown or unsupported values', () => {
      assert.strictEqual(parseContentCaptureMode('1'), 'none');
      assert.strictEqual(parseContentCaptureMode('0'), 'none');
      assert.strictEqual(parseContentCaptureMode('event_only'), 'none');
      assert.strictEqual(parseContentCaptureMode('unknown_mode'), 'none');
    });
  });

  describe('getContentCaptureMode', () => {
    const origEnv = process.env[ENV_GENAI_CAPTURE_MESSAGE_CONTENT];

    afterEach(() => {
      if (origEnv !== undefined) {
        process.env[ENV_GENAI_CAPTURE_MESSAGE_CONTENT] = origEnv;
      } else {
        delete process.env[ENV_GENAI_CAPTURE_MESSAGE_CONTENT];
      }
      delete process.env.TEST_CUSTOM_CAPTURE_ENV;
    });

    it('should respect config when environment variable is not set', () => {
      delete process.env[ENV_GENAI_CAPTURE_MESSAGE_CONTENT];
      assert.strictEqual(getContentCaptureMode('span_only'), 'span_only');
      assert.strictEqual(getContentCaptureMode('none'), 'none');
      assert.strictEqual(getContentCaptureMode(undefined), 'none');
      assert.strictEqual(getContentCaptureMode(), 'none');
    });

    it('should prioritize environment variable over config', () => {
      process.env[ENV_GENAI_CAPTURE_MESSAGE_CONTENT] = 'span_only';
      assert.strictEqual(getContentCaptureMode('none'), 'span_only');
      assert.strictEqual(getContentCaptureMode(undefined), 'span_only');

      process.env[ENV_GENAI_CAPTURE_MESSAGE_CONTENT] = 'none';
      assert.strictEqual(getContentCaptureMode('span_only'), 'none');
    });

    it('should fall back to config when environment variable is empty or whitespace', () => {
      process.env[ENV_GENAI_CAPTURE_MESSAGE_CONTENT] = '';
      assert.strictEqual(getContentCaptureMode('span_only'), 'span_only');

      process.env[ENV_GENAI_CAPTURE_MESSAGE_CONTENT] = '   ';
      assert.strictEqual(getContentCaptureMode('span_only'), 'span_only');
    });

    it('should support custom envVarName', () => {
      process.env.TEST_CUSTOM_CAPTURE_ENV = 'span_only';
      assert.strictEqual(
        getContentCaptureMode('none', 'TEST_CUSTOM_CAPTURE_ENV'),
        'span_only'
      );
    });
  });
});
