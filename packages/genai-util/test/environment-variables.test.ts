/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import {
  ENV_GENAI_CAPTURE_MESSAGE_CONTENT,
  getContentCaptureMode,
  parseContentCaptureMode,
  isSpanContentCaptureEnabled,
  isEventContentCaptureEnabled,
} from '../src/environment-variables';

describe('Environment Variables and Content Capture', () => {
  const origEnv = process.env[ENV_GENAI_CAPTURE_MESSAGE_CONTENT];

  afterEach(() => {
    if (origEnv !== undefined) {
      process.env[ENV_GENAI_CAPTURE_MESSAGE_CONTENT] = origEnv;
    } else {
      delete process.env[ENV_GENAI_CAPTURE_MESSAGE_CONTENT];
    }
  });

  describe('parseContentCaptureMode', () => {
    it('should parse boolean values', () => {
      assert.strictEqual(parseContentCaptureMode(true), 'span_only');
      assert.strictEqual(parseContentCaptureMode(false), 'none');
    });

    it('should parse string values', () => {
      assert.strictEqual(parseContentCaptureMode('true'), 'span_only');
      assert.strictEqual(parseContentCaptureMode('1'), 'span_only');
      assert.strictEqual(parseContentCaptureMode('span_only'), 'span_only');
      assert.strictEqual(parseContentCaptureMode('SPAN_ONLY'), 'span_only');
      assert.strictEqual(parseContentCaptureMode('span'), 'span_only');
      assert.strictEqual(parseContentCaptureMode('event_only'), 'none');
      assert.strictEqual(parseContentCaptureMode('span_and_event'), 'none');
      assert.strictEqual(parseContentCaptureMode('false'), 'none');
      assert.strictEqual(parseContentCaptureMode('no_content'), 'none');
      assert.strictEqual(parseContentCaptureMode('none'), 'none');
      assert.strictEqual(parseContentCaptureMode(undefined), 'none');
      assert.strictEqual(parseContentCaptureMode('unknown_mode'), 'none');
    });
  });

  describe('getContentCaptureMode', () => {
    it('should respect config when environment variable is not set', () => {
      delete process.env[ENV_GENAI_CAPTURE_MESSAGE_CONTENT];
      assert.strictEqual(getContentCaptureMode(true), 'span_only');
      assert.strictEqual(getContentCaptureMode('span_only'), 'span_only');
      assert.strictEqual(getContentCaptureMode(false), 'none');
      assert.strictEqual(getContentCaptureMode(undefined), 'none');
    });

    it('should prioritize environment variable over config', () => {
      process.env[ENV_GENAI_CAPTURE_MESSAGE_CONTENT] = 'span_only';
      assert.strictEqual(getContentCaptureMode(false), 'span_only');
      assert.strictEqual(getContentCaptureMode('none'), 'span_only');
    });
  });

  describe('mode checkers', () => {
    it('isSpanContentCaptureEnabled', () => {
      assert.strictEqual(isSpanContentCaptureEnabled('none'), false);
      assert.strictEqual(isSpanContentCaptureEnabled('span_only'), true);
    });

    it('isEventContentCaptureEnabled placeholder', () => {
      assert.strictEqual(isEventContentCaptureEnabled('none'), false);
      assert.strictEqual(isEventContentCaptureEnabled('span_only'), false);
    });
  });
});
