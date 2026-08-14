/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import {
  ENV_GENAI_CAPTURE_MESSAGE_CONTENT,
  getEnvBool,
  getContentCaptureMode,
  parseContentCaptureMode,
  isCaptureMessageContentEnabled,
  isSpanContentCaptureEnabled,
  isEventContentCaptureEnabled,
} from '../src';

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
      assert.strictEqual(parseContentCaptureMode('event_only'), 'event_only');
      assert.strictEqual(
        parseContentCaptureMode('span_and_event'),
        'span_and_event'
      );
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
      assert.strictEqual(getContentCaptureMode('event_only'), 'event_only');
      assert.strictEqual(getContentCaptureMode(false), 'none');
      assert.strictEqual(getContentCaptureMode(undefined), 'none');
    });

    it('should prioritize environment variable over config', () => {
      process.env[ENV_GENAI_CAPTURE_MESSAGE_CONTENT] = 'span_and_event';
      assert.strictEqual(getContentCaptureMode(false), 'span_and_event');
      assert.strictEqual(getContentCaptureMode('none'), 'span_and_event');
    });
  });

  describe('mode checkers', () => {
    it('isCaptureMessageContentEnabled', () => {
      assert.strictEqual(isCaptureMessageContentEnabled('none'), false);
      assert.strictEqual(isCaptureMessageContentEnabled('span_only'), true);
      assert.strictEqual(isCaptureMessageContentEnabled('event_only'), true);
      assert.strictEqual(
        isCaptureMessageContentEnabled('span_and_event'),
        true
      );
    });

    it('isSpanContentCaptureEnabled', () => {
      assert.strictEqual(isSpanContentCaptureEnabled('none'), false);
      assert.strictEqual(isSpanContentCaptureEnabled('span_only'), true);
      assert.strictEqual(isSpanContentCaptureEnabled('event_only'), false);
      assert.strictEqual(isSpanContentCaptureEnabled('span_and_event'), true);
    });

    it('isEventContentCaptureEnabled', () => {
      assert.strictEqual(isEventContentCaptureEnabled('none'), false);
      assert.strictEqual(isEventContentCaptureEnabled('span_only'), false);
      assert.strictEqual(isEventContentCaptureEnabled('event_only'), true);
      assert.strictEqual(isEventContentCaptureEnabled('span_and_event'), true);
    });
  });

  describe('getEnvBool', () => {
    it('should parse boolean environment variables', () => {
      process.env['TEST_BOOL_VAR'] = 'true';
      assert.strictEqual(getEnvBool('TEST_BOOL_VAR'), true);

      process.env['TEST_BOOL_VAR'] = '1';
      assert.strictEqual(getEnvBool('TEST_BOOL_VAR'), true);

      process.env['TEST_BOOL_VAR'] = 'false';
      assert.strictEqual(getEnvBool('TEST_BOOL_VAR'), false);

      process.env['TEST_BOOL_VAR'] = '0';
      assert.strictEqual(getEnvBool('TEST_BOOL_VAR'), false);

      delete process.env['TEST_BOOL_VAR'];
      assert.strictEqual(getEnvBool('TEST_BOOL_VAR'), undefined);

      process.env['TEST_BOOL_VAR'] = 'invalid';
      assert.strictEqual(getEnvBool('TEST_BOOL_VAR'), undefined);
      delete process.env['TEST_BOOL_VAR'];
    });
  });
});
