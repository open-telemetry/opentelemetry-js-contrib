/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables';
import { DynamicTool } from '@langchain/core/tools';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import exercise from './exercise.cjs';

const framework =
  process.env.LANGCHAIN_TEST_CORE_ONLY === 'true'
    ? {}
    : {
        ...(await import('langchain')),
        ...(await import('@langchain/langgraph')),
        ...(await import('@langchain/classic/vectorstores/memory')),
        ...(await import('@langchain/core/embeddings')),
      };

await exercise({
  RunnableSequence,
  RunnableLambda,
  DynamicTool,
  FakeListChatModel,
  ...framework,
});
