/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Handler, StreamifyHandler } from 'aws-lambda';

export type LambdaModule = Record<string, Handler | StreamifyHandler>;

export type SqsQueueArnParts = {
  region: string;
  accountId: string;
  queueName: string;
};
