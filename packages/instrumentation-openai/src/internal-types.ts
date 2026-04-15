/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { AnyValue } from '@opentelemetry/api-logs';

// This mimicks `APIPromise` from `openai` sufficiently for usage in this
// instrumentation. OpenAI's APIPromise adds some methods, but we don't use
// those. We don't import the type directly from `openai` because how to
// import it has changed between openai@4 and openai@5.
export type APIPromise<T> = Promise<T>;

export type GenAIFunction = {
  name: string;
  arguments?: AnyValue;
};

export type GenAIToolCall = {
  id: string;
  type: string;
  function?: GenAIFunction;
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
