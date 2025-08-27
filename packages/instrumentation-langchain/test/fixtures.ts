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

export const bedrockCompletionsResponse = {
  contentType: 'application/json',
  body: JSON.stringify({
    id: 'bedrock-response-id',
    model: 'anthropic.claude-v2',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'This is a test response from Bedrock.',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 12,
      completion_tokens: 8,
      total_tokens: 20,
    },
  }),
};

export const bedrockFunctionCallResponse = {
  contentType: 'application/json',
  body: JSON.stringify({
    id: 'bedrock-function-call-id',
    model: 'anthropic.claude-v2',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              type: 'function',
              function: {
                name: 'get_current_weather',
                arguments: JSON.stringify({
                  location: 'Seattle, WA',
                  unit: 'fahrenheit',
                }),
              },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
    usage: {
      prompt_tokens: 90,
      completion_tokens: 25,
      total_tokens: 115,
    },
  }),
};
