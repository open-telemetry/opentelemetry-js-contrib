/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Unstable GenAI conventions are defined locally per repository guidelines,
// rather than importing @opentelemetry/semantic-conventions/incubating.
// Source: https://github.com/open-telemetry/semantic-conventions-genai/tree/fee465db333bdd6a7d2faa320edab5cf3101a4f4
export const ATTR_GEN_AI_CONVERSATION_ID = 'gen_ai.conversation.id';
export const ATTR_GEN_AI_INPUT_MESSAGES = 'gen_ai.input.messages';
export const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name';
export const ATTR_GEN_AI_OUTPUT_MESSAGES = 'gen_ai.output.messages';
export const ATTR_GEN_AI_WORKFLOW_NAME = 'gen_ai.workflow.name';
export const GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW = 'invoke_workflow';
