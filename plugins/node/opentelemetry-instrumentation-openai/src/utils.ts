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

import { Span, SpanStatusCode } from '@opentelemetry/api';
import { encodingForModel, TiktokenModel } from 'js-tiktoken';
import { PricingObject } from './types';

export default class InstrumentationUtil {
  static readonly PROMPT_TOKEN_FACTOR = 1000;

  static openaiTokens(text: string, model: string): number {
    try {
      const encoding = encodingForModel(model as TiktokenModel);
      return encoding.encode(text).length;
    } catch (error) {
      console.error(`Error in openaiTokens: ${error}`);
      throw error;
    }
  }

  static getChatModelCost(
    model: string,
    promptTokens: number,
    completionTokens: number,
    pricingInfo?: PricingObject
  ): number {
    try {
      if (!pricingInfo) return 0;
      return (
        (promptTokens / InstrumentationUtil.PROMPT_TOKEN_FACTOR) *
          (pricingInfo.chat[model].promptPrice || 0) +
        (completionTokens / InstrumentationUtil.PROMPT_TOKEN_FACTOR) *
          pricingInfo.chat[model].completionPrice
      );
    } catch (error) {
      console.error(`Error in getChatModelCost: ${error}`);
      return 0;
    }
  }

  static handleException(span: Span, error: Error): void {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }

  static async createStreamProxy (stream: any, generatorFuncResponse: any): Promise<any> {
    return new Proxy(stream, {
      get (target, prop, receiver) {
        if (prop === Symbol.asyncIterator) {
          return () => generatorFuncResponse
        }
        return Reflect.get(target, prop, receiver)
      }
    })
  }
}
