/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Unstable GenAI conventions are defined locally per repository guidelines,
// rather than importing @opentelemetry/semantic-conventions/incubating.
// Source: https://github.com/open-telemetry/semantic-conventions-genai/tree/aa3b7f4394245fec260013898049780975a407a4
export const ATTR_GEN_AI_AGENT_NAME = 'gen_ai.agent.name';
export const ATTR_GEN_AI_CONVERSATION_ID = 'gen_ai.conversation.id';
export const ATTR_GEN_AI_INPUT_MESSAGES = 'gen_ai.input.messages';
export const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name';
export const ATTR_GEN_AI_OUTPUT_MESSAGES = 'gen_ai.output.messages';
export const GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW = 'invoke_workflow';

export const METRIC_GEN_AI_INVOKE_AGENT_DURATION =
  'gen_ai.invoke_agent.duration';
