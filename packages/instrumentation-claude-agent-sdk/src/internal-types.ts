/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-expect-error -- TypeScript 5.0 misclassifies erased imports from ESM-only packages as runtime requires.
import type * as ClaudeAgentSDK from '@anthropic-ai/claude-agent-sdk';

export type QueryFunction = typeof ClaudeAgentSDK.query;
export type Query = ReturnType<QueryFunction>;
export type QueryParameters = Parameters<QueryFunction>[0];

export interface ClaudeAgentSDKModule {
  query?: QueryFunction;
  default?: ClaudeAgentSDKModule;
}

export type SDKMessage = ClaudeAgentSDK.SDKMessage;
export type SDKResultMessage = ClaudeAgentSDK.SDKResultMessage;
export type SDKResultError = ClaudeAgentSDK.SDKResultError;
export type SDKSystemMessage = ClaudeAgentSDK.SDKSystemMessage;
export type SDKUserMessage = ClaudeAgentSDK.SDKUserMessage;
export type Options = ClaudeAgentSDK.Options;
export type PreToolUseHookInput = ClaudeAgentSDK.PreToolUseHookInput;
export type PostToolUseHookInput = ClaudeAgentSDK.PostToolUseHookInput;
export type PostToolUseFailureHookInput =
  ClaudeAgentSDK.PostToolUseFailureHookInput;
export type HookEvent = ClaudeAgentSDK.HookEvent;
export type HookCallback = ClaudeAgentSDK.HookCallback;
export type HookCallbackMatcher = ClaudeAgentSDK.HookCallbackMatcher;
