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
  AttributeValue,
  Span,
  SpanKind,
  SpanStatusCode,
  Tracer,
  context,
  trace,
} from '@opentelemetry/api';
import InstrumentationHelperConfig from './config';
import InstrumentationUtil from './utils';
import SemanticConvention from './semantic-conventions';

export default class OpenAIWrapper {
  static setBaseSpanAttributes(
    span: Span,
    {
      genAIEndpoint,
      model,
      user,
      environment,
      applicationName,
    }: {
      genAIEndpoint: string;
      model: string;
      user: unknown;
      environment: string;
      applicationName: string;
    }
  ) {
    span.setAttribute(
      SemanticConvention.GEN_AI_SYSTEM,
      SemanticConvention.GEN_AI_SYSTEM_OPENAI
    );
    span.setAttribute(SemanticConvention.GEN_AI_ENDPOINT, genAIEndpoint);
    span.setAttribute(SemanticConvention.GEN_AI_ENVIRONMENT, environment);
    span.setAttribute(
      SemanticConvention.GEN_AI_APPLICATION_NAME,
      applicationName
    );
    span.setAttribute(SemanticConvention.GEN_AI_REQUEST_MODEL, model);
    span.setAttribute(
      SemanticConvention.GEN_AI_REQUEST_USER,
      user as AttributeValue
    );

    span.setStatus({ code: SpanStatusCode.OK });
  }

  static _patchChatCompletionCreate(tracer: Tracer): any {
    const genAIEndpoint = 'openai.resources.chat.completions';
    return (originalMethod: (...args: any[]) => any) => {
      return async function (this: any, ...args: any[]) {
        const span = tracer.startSpan(genAIEndpoint, { kind: SpanKind.CLIENT });
        return context
          .with(trace.setSpan(context.active(), span), async () => {
            return originalMethod.apply(this, args);
          })
          .then(response => {
            const { stream = false } = args[0];

            if (!!stream) {
              return InstrumentationUtil.createStreamProxy(
                response,
                OpenAIWrapper._chatCompletionGenerator({
                  args,
                  genAIEndpoint,
                  response,
                  span,
                })
              );
            }

            return OpenAIWrapper._chatCompletion({
              args,
              genAIEndpoint,
              response,
              span,
            });
          })
          .catch((e: any) => {
            InstrumentationUtil.handleException(span, e);
            span.end();
          });
      };
    };
  }

  static async _chatCompletion({
    args,
    genAIEndpoint,
    response,
    span,
  }: {
    args: any[];
    genAIEndpoint: string;
    response: any;
    span: Span;
  }): Promise<any> {
    try {
      await OpenAIWrapper._chatCompletionCommonSetter({
        args,
        genAIEndpoint,
        result: response,
        span,
      });
      return response;
    } catch (e: any) {
      InstrumentationUtil.handleException(span, e);
    } finally {
      span.end();
    }
  }

  static async *_chatCompletionGenerator({
    args,
    genAIEndpoint,
    response,
    span,
  }: {
    args: any[];
    genAIEndpoint: string;
    response: any;
    span: Span;
  }): AsyncGenerator<unknown, any, unknown> {
    try {
      const { messages } = args[0];
      let { tools } = args[0];
      const result = {
        id: '0',
        created: -1,
        model: '',
        choices: [
          {
            index: 0,
            logprobs: null,
            finish_reason: 'stop',
            message: { role: 'assistant', content: '' },
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };
      for await (const chunk of response) {
        result.id = chunk.id;
        result.created = chunk.created;
        result.model = chunk.model;

        if (chunk.choices[0]?.finish_reason) {
          result.choices[0].finish_reason = chunk.choices[0].finish_reason;
        }
        if (chunk.choices[0]?.logprobs) {
          result.choices[0].logprobs = chunk.choices[0].logprobs;
        }
        if (chunk.choices[0]?.delta.content) {
          result.choices[0].message.content += chunk.choices[0].delta.content;
        }

        if (chunk.choices[0]?.delta.tool_calls) {
          tools = true;
        }

        yield chunk;
      }

      let promptTokens = 0;
      for (const message of messages || []) {
        promptTokens +=
          InstrumentationUtil.openaiTokens(
            message.content as string,
            result.model
          ) ?? 0;
      }

      const completionTokens = InstrumentationUtil.openaiTokens(
        result.choices[0].message.content ?? '',
        result.model
      );
      if (completionTokens) {
        result.usage = {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        };
      }

      args[0].tools = tools;

      await OpenAIWrapper._chatCompletionCommonSetter({
        args,
        genAIEndpoint,
        result,
        span,
      });

      return result;
    } catch (e: any) {
      InstrumentationUtil.handleException(span, e);
    } finally {
      span.end();
    }
  }

  static async _chatCompletionCommonSetter({
    args,
    genAIEndpoint,
    result,
    span,
  }: {
    args: any[];
    genAIEndpoint: string;
    result: any;
    span: Span;
  }) {
    const applicationName = InstrumentationHelperConfig.applicationName;
    const environment = InstrumentationHelperConfig.environment;
    const traceContent = InstrumentationHelperConfig.traceContent;
    const {
      messages,
      frequency_penalty = 0,
      max_tokens = null,
      n = 1,
      presence_penalty = 0,
      seed = null,
      temperature = 1,
      top_p,
      user,
      stream = false,
      tools,
    } = args[0];

    // Request Params attributes : Start
    span.setAttribute(SemanticConvention.GEN_AI_REQUEST_TOP_P, top_p || 1);
    span.setAttribute(SemanticConvention.GEN_AI_REQUEST_MAX_TOKENS, max_tokens);
    span.setAttribute(
      SemanticConvention.GEN_AI_REQUEST_TEMPERATURE,
      temperature
    );
    span.setAttribute(
      SemanticConvention.GEN_AI_REQUEST_PRESENCE_PENALTY,
      presence_penalty
    );
    span.setAttribute(
      SemanticConvention.GEN_AI_REQUEST_FREQUENCY_PENALTY,
      frequency_penalty
    );
    span.setAttribute(SemanticConvention.GEN_AI_REQUEST_SEED, seed);
    span.setAttribute(SemanticConvention.GEN_AI_REQUEST_IS_STREAM, stream);

    if (traceContent) {
      // Format 'messages' into a single string
      const messagePrompt = messages || [];
      const formattedMessages = [];

      for (const message of messagePrompt) {
        const role = message.role;
        const content = message.content;

        if (Array.isArray(content)) {
          const contentStr = content
            .map(item => {
              if ('type' in item) {
                return `${item.type}: ${
                  item.text ? item.text : item.image_url
                }`;
              } else {
                return `text: ${item.text}`;
              }
            })
            .join(', ');
          formattedMessages.push(`${role}: ${contentStr}`);
        } else {
          formattedMessages.push(`${role}: ${content}`);
        }
      }

      const prompt = formattedMessages.join('\n');
      span.setAttribute(SemanticConvention.GEN_AI_CONTENT_PROMPT, prompt);
    }
    // Request Params attributes : End

    span.setAttribute(
      SemanticConvention.GEN_AI_TYPE,
      SemanticConvention.GEN_AI_TYPE_CHAT
    );

    span.setAttribute(SemanticConvention.GEN_AI_RESPONSE_ID, result.id);

    const model = result.model || 'gpt-3.5-turbo';

    if (InstrumentationHelperConfig.pricing_json) {
      // Calculate cost of the operation
      const cost = InstrumentationUtil.getChatModelCost(
        model,
        result.usage.prompt_tokens,
        result.usage.completion_tokens,
        InstrumentationHelperConfig.pricing_json
      );
      span.setAttribute(
        SemanticConvention.GEN_AI_USAGE_COST,
        cost as AttributeValue
      );
    }

    OpenAIWrapper.setBaseSpanAttributes(span, {
      genAIEndpoint,
      model,
      user,
      applicationName,
      environment,
    });

    span.setAttribute(
      SemanticConvention.GEN_AI_USAGE_PROMPT_TOKENS,
      result.usage.prompt_tokens
    );
    span.setAttribute(
      SemanticConvention.GEN_AI_USAGE_COMPLETION_TOKENS,
      result.usage.completion_tokens
    );
    span.setAttribute(
      SemanticConvention.GEN_AI_USAGE_TOTAL_TOKENS,
      result.usage.total_tokens
    );

    if (result.choices[0].finish_reason) {
      span.setAttribute(
        SemanticConvention.GEN_AI_RESPONSE_FINISH_REASON,
        result.choices[0].finish_reason
      );
    }

    if (tools) {
      span.setAttribute(
        SemanticConvention.GEN_AI_CONTENT_COMPLETION,
        'Function called with tools'
      );
    } else {
      if (traceContent) {
        if (n === 1) {
          span.setAttribute(
            SemanticConvention.GEN_AI_CONTENT_COMPLETION,
            result.choices[0].message.content
          );
        } else {
          let i = 0;
          while (i < n) {
            const attribute_name = `${SemanticConvention.GEN_AI_CONTENT_COMPLETION}.[i]`;
            span.setAttribute(
              attribute_name,
              result.choices[i].message.content
            );
            i += 1;
          }
        }
      }
    }
  }
}
