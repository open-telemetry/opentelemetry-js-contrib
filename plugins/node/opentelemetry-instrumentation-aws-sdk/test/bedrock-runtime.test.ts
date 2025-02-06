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

/**
 * These tests verify telemetry created against actual API responses
 * which can be difficult to mock for LLMs. The responses are recorded
 * automatically using nock's nock-back feature. Responses are recorded
 * to the mock-responses directory with the name of the test - by default
 * if a response is available for the current test it is used, and
 * otherwise a real request is made and the response is recorded.
 * To re-record all responses, set the NOCK_BACK_MODE environment variable
 * to 'update' - when recording responses, valid AWS credentials for
 * accessing bedrock are also required.
 */

import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';
import { AwsInstrumentation } from '../src';
registerInstrumentationTesting(new AwsInstrumentation());

import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConversationRole,
} from '@aws-sdk/client-bedrock-runtime';
import * as path from 'path';
import { Definition, back as nockBack } from 'nock';

import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_GEN_AI_SYSTEM,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
} from '../src/semconv';
import { expect } from 'expect';

const region = 'us-east-1';

// Remove any data from recorded responses that could have sensitive data
// and that we don't need for testing.
const sanitizeRecordings = (scopes: Definition[]) => {
  for (const scope of scopes) {
    // Type definition seems to be incorrect of headers.
    const headers: string[] = (scope as any).rawHeaders;
    for (let i = 0; i < headers.length; i += 2) {
      if (headers[i].toLowerCase() === 'set-cookie') {
        headers.splice(i, 2);
      }
    }
  }
  return scopes;
};

describe('Bedrock', () => {
  const client = new BedrockRuntimeClient({ region });

  nockBack.fixtures = path.join(__dirname, 'mock-responses');
  if (!process.env.NOCK_BACK_MODE) {
    nockBack.setMode('record');
  }

  let nockDone: () => void;
  beforeEach(async function () {
    const filename = `${this.currentTest
      ?.fullTitle()
      .toLowerCase()
      .replace(/\s/g, '-')}.json`;
    const { nockDone: nd } = await nockBack(filename, {
      afterRecord: sanitizeRecordings,
    });
    nockDone = nd;
  });

  afterEach(async function () {
    nockDone();
  });

  describe('Converse', () => {
    it('adds genai conventions', async () => {
      const modelId = 'amazon.titan-text-lite-v1';
      const messages = [
        {
          role: ConversationRole.USER,
          content: [{ text: 'Say this is a test' }],
        },
      ];
      const inferenceConfig = {
        maxTokens: 10,
        temperature: 0.8,
        topP: 1,
        stopSequences: ['|'],
      };

      const command = new ConverseCommand({
        modelId,
        messages,
        inferenceConfig,
      });
      const response = await client.send(command);
      expect(response.output?.message?.content?.[0].text).toBe(
        "Hi. I'm not sure what"
      );

      const testSpans: ReadableSpan[] = getTestSpans();
      const converseSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'chat amazon.titan-text-lite-v1';
        }
      );
      expect(converseSpans.length).toBe(1);
      expect(converseSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['max_tokens'],
      });
    });
  });
});
