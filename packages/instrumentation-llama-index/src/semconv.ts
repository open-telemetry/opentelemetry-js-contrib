/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The OpenTelemetry schema URL for GenAI semantic conventions.
 */
export const GEN_AI_SCHEMA_URL =
  'https://opentelemetry.io/schemas/gen-ai-dev/1.42.0-dev' as const;

// ============================================================================
// Span Attributes
// ============================================================================

/**
 * The name of the operation being performed.
 */
export const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name' as const;

/**
 * The Generative AI provider as identified by the client or server instrumentation.
 */
export const ATTR_GEN_AI_PROVIDER_NAME = 'gen_ai.provider.name' as const;

/**
 * The name of the GenAI model a request is being made to.
 */
export const ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model' as const;

/**
 * The number of dimensions the resulting output embeddings should have.
 */
export const ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT =
  'gen_ai.embeddings.dimension.count' as const;

/**
 * Query text submitted to retrieval.
 */
export const ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT =
  'gen_ai.retrieval.query.text' as const;

/**
 * Documents returned by retrieval.
 */
export const ATTR_GEN_AI_RETRIEVAL_DOCUMENTS =
  'gen_ai.retrieval.documents' as const;

/**
 * Top k parameter for retrieval.
 */
export const ATTR_GEN_AI_RETRIEVAL_TOP_K = 'gen_ai.retrieval.top_k' as const;

/**
 * Human-readable name of the GenAI workflow.
 */
export const ATTR_GEN_AI_WORKFLOW_NAME = 'gen_ai.workflow.name' as const;

/**
 * The input prompt or query provided to the workflow.
 */
export const ATTR_GEN_AI_INPUT_MESSAGES = 'gen_ai.input.messages' as const;

/**
 * The output response returned by the workflow.
 */
export const ATTR_GEN_AI_OUTPUT_MESSAGES = 'gen_ai.output.messages' as const;

// ============================================================================
// Operation Values
// ============================================================================

export const GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS = 'embeddings' as const;
export const GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL = 'retrieval' as const;
export const GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW =
  'invoke_workflow' as const;
