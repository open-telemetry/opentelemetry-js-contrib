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
      cost,
      environment,
      applicationName,
    }: {
      genAIEndpoint: string;
      model: string;
      user: unknown;
      cost: unknown;
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
    if (cost !== undefined)
      span.setAttribute(
        SemanticConvention.GEN_AI_USAGE_COST,
        cost as AttributeValue
      );

    span.setStatus({ code: SpanStatusCode.OK });
  }

  static _patchChatCompletionCreate(tracer: Tracer): any {
    const genAIEndpoint = 'openai.resources.chat.completions';
    const applicationName = InstrumentationHelperConfig.applicationName;
    const environment = InstrumentationHelperConfig.environment;
    const traceContent = InstrumentationHelperConfig.traceContent;
    return (originalMethod: (...args: any[]) => any) => {
      return async function (this: any, ...args: any[]) {
        const span = tracer.startSpan(genAIEndpoint, { kind: SpanKind.CLIENT });

        return context.with(trace.setSpan(context.active(), span), async () => {
          try {
            const response = await originalMethod.apply(this, args);
            const {
              messages,
              frequency_penalty = 0,
              max_tokens = null,
              n = 1,
              presence_penalty = 0,
              seed = null,
              temperature = 1,
              tools,
              top_p,
              user,
              stream = false,
            } = args[0];

            // Request Params attributes : Start
            span.setAttribute(
              SemanticConvention.GEN_AI_REQUEST_TOP_P,
              top_p || 1
            );
            span.setAttribute(
              SemanticConvention.GEN_AI_REQUEST_MAX_TOKENS,
              max_tokens
            );
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
            span.setAttribute(
              SemanticConvention.GEN_AI_REQUEST_IS_STREAM,
              stream
            );

            if (!stream) {
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
                span.setAttribute(
                  SemanticConvention.GEN_AI_CONTENT_PROMPT,
                  prompt
                );
              }
              // Request Params attributes : End

              span.setAttribute(
                SemanticConvention.GEN_AI_TYPE,
                SemanticConvention.GEN_AI_TYPE_CHAT
              );
              span.setAttribute(
                SemanticConvention.GEN_AI_RESPONSE_ID,
                response.id
              );

              const model = response.model || 'gpt-3.5-turbo';

              const pricingInfo: Record<string, unknown> =
                await InstrumentationHelperConfig.updatePricingJson(
                  InstrumentationHelperConfig.pricing_json
                );

              // Calculate cost of the operation
              const cost = InstrumentationUtil.getChatModelCost(
                model,
                pricingInfo,
                response.usage.prompt_tokens,
                response.usage.completion_tokens
              );

              OpenAIWrapper.setBaseSpanAttributes(span, {
                genAIEndpoint,
                model,
                user,
                cost,
                applicationName,
                environment,
              });

              if (!tools) {
                span.setAttribute(
                  SemanticConvention.GEN_AI_USAGE_PROMPT_TOKENS,
                  response.usage.prompt_tokens
                );
                span.setAttribute(
                  SemanticConvention.GEN_AI_USAGE_COMPLETION_TOKENS,
                  response.usage.completion_tokens
                );
                span.setAttribute(
                  SemanticConvention.GEN_AI_USAGE_TOTAL_TOKENS,
                  response.usage.total_tokens
                );
                span.setAttribute(
                  SemanticConvention.GEN_AI_RESPONSE_FINISH_REASON,
                  response.choices[0].finish_reason
                );

                if (traceContent) {
                  if (n === 1) {
                    span.setAttribute(
                      SemanticConvention.GEN_AI_CONTENT_COMPLETION,
                      response.choices[0].message.content
                    );
                  } else {
                    let i = 0;
                    while (i < n) {
                      const attribute_name = `${SemanticConvention.GEN_AI_CONTENT_COMPLETION}.[i]`;
                      span.setAttribute(
                        attribute_name,
                        response.choices[i].message.content
                      );
                      i += 1;
                    }
                  }
                }
              } else {
                span.setAttribute(
                  SemanticConvention.GEN_AI_CONTENT_COMPLETION,
                  'Function called with tools'
                );
                span.setAttribute(
                  SemanticConvention.GEN_AI_USAGE_PROMPT_TOKENS,
                  response.usage.prompt_tokens
                );
                span.setAttribute(
                  SemanticConvention.GEN_AI_USAGE_COMPLETION_TOKENS,
                  response.usage.completion_tokens
                );
                span.setAttribute(
                  SemanticConvention.GEN_AI_USAGE_TOTAL_TOKENS,
                  response.usage.total_tokens
                );
              }
            }

            return response;
          } catch (e: unknown) {
            InstrumentationUtil.handleException(span, e as Error);
          } finally {
            span.end();
          }
        });
      };
    };
  }
}
