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

type PricingObject = {
  chat: Record<string, { promptPrice: number; completionPrice: number }>;
};

export default class InstrumentationUtil {
  static readonly PROMPT_TOKEN_FACTOR = 1000;

  static getChatModelCost(
    model: string,
    pricingInfo: Record<string, unknown>,
    promptTokens: number,
    completionTokens: number
  ): number {
    const pricingObject: PricingObject = pricingInfo as PricingObject;
    try {
      return (
        (promptTokens / InstrumentationUtil.PROMPT_TOKEN_FACTOR) *
          pricingObject.chat[model].promptPrice +
        (completionTokens / InstrumentationUtil.PROMPT_TOKEN_FACTOR) *
          pricingObject.chat[model].completionPrice
      );
    } catch (error) {
      console.error(`Error in getChatModelCost: ${error}`);
      return 0;
    }
  }

  static async fetchPricingInfo(
    pricingJson: Record<string, unknown> | string
  ): Promise<Record<string, unknown>> {
    let pricingUrl =
      'https://raw.githubusercontent.com/openlit/openlit/main/assets/pricing.json';
    if (pricingJson) {
      let isUrl = false;
      try {
        isUrl = !!new URL(pricingJson as string);
      } catch {
        isUrl = false;
      }

      if (isUrl) {
        pricingUrl = pricingJson as string;
      } else {
        try {
          if (typeof pricingJson === 'string') {
            const json = JSON.parse(pricingJson);
            return json;
          } else {
            const json = JSON.parse(JSON.stringify(pricingJson));
            return json;
          }
        } catch {
          return {};
        }
      }
    }

    try {
      const response = await fetch(pricingUrl);
      if (response.ok) {
        return response.json();
      } else {
        throw new Error(
          `HTTP error occurred while fetching pricing info: ${response.status}`
        );
      }
    } catch (error) {
      console.error(
        `Unexpected error occurred while fetching pricing info: ${error}`
      );
      return {};
    }
  }

  static handleException(span: Span, error: Error): void {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }
}
