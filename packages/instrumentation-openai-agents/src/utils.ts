/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { diag } from '@opentelemetry/api';
import type { DiagLogger } from '@opentelemetry/api';

export function getEnvBool(
  name: string,
  diag_: DiagLogger = diag
): boolean | undefined {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(
      `invalid type for environment variable: ${typeof value} (${name}=${value})`
    );
  }

  const normalized = value.toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }

  diag_.warn(
    `invalid boolean value for environment variable: ${name}=${value}; ignoring`
  );
  return undefined;
}
