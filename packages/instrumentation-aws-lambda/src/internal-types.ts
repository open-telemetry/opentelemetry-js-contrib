/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Handler, StreamifyHandler } from 'aws-lambda';

export type LambdaModule = Record<string, Handler | StreamifyHandler>;
