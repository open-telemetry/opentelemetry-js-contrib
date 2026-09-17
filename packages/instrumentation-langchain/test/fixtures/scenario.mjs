/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables';
import { DynamicTool } from '@langchain/core/tools';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { createAgent } from 'langchain';
import exercise from './exercise.cjs';

await exercise({
  RunnableSequence,
  RunnableLambda,
  DynamicTool,
  FakeListChatModel,
  createAgent,
});
