/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import {
  ENV_GENAI_CAPTURE_MESSAGE_CONTENT,
  parseContentCaptureMode,
  isSpanContentCaptureEnabled,
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
    });

    it('should parse explicit none / no content modes', () => {
      assert.strictEqual(parseContentCaptureMode('none'), 'none');
      assert.strictEqual(parseContentCaptureMode('NONE'), 'none');
      assert.strictEqual(parseContentCaptureMode('no_content'), 'none');
      assert.strictEqual(parseContentCaptureMode('NO_CONTENT'), 'none');
      assert.strictEqual(parseContentCaptureMode(''), 'none');
      assert.strictEqual(parseContentCaptureMode('   '), 'none');
    });

    it('should fall back to "none" for unknown or unsupported values', () => {
      assert.strictEqual(parseContentCaptureMode('true'), 'none');
      assert.strictEqual(parseContentCaptureMode('false'), 'none');
      assert.strictEqual(parseContentCaptureMode('1'), 'none');
      assert.strictEqual(parseContentCaptureMode('0'), 'none');
      assert.strictEqual(parseContentCaptureMode('event_only'), 'none');
      assert.strictEqual(parseContentCaptureMode('span_and_event'), 'none');
      assert.strictEqual(parseContentCaptureMode('unknown_mode'), 'none');
    });
  });

  describe('mode checkers', () => {
    it('isSpanContentCaptureEnabled', () => {
      assert.strictEqual(isSpanContentCaptureEnabled('none'), false);
      assert.strictEqual(isSpanContentCaptureEnabled('span_only'), true);
    });
  });
});
