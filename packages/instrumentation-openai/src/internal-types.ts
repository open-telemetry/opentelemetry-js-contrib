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
import { AnyValue } from '@opentelemetry/api-logs';

export type GenAIFunction = {
  name: string;
  arguments?: AnyValue;
};

export type GenAIToolCall = {
  id: string;
  type: string;
  function: GenAIFunction;
};

export type GenAIMessage = {
  role?: string;
  content?: AnyValue;
  tool_calls?: GenAIToolCall[];
};

export type GenAIChoiceEventBody = {
  finish_reason: string;
  index: number;
  message: GenAIMessage;
};

export type GenAISystemMessageEventBody = {
  role?: string;
  content?: AnyValue;
};

export type GenAIUserMessageEventBody = {
  role?: string;
  content?: AnyValue;
};

export type GenAIAssistantMessageEventBody = {
  role?: string;
  content?: AnyValue;
  tool_calls?: GenAIToolCall[];
};

export type GenAIToolMessageEventBody = {
  role?: string;
  content?: AnyValue;
  id: string;
};
