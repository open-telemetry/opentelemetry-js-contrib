/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isRecord } from './content';

export function retrievalDocuments(output: unknown): string {
  if (!Array.isArray(output))
    throw new TypeError('Expected LangChain retrieval documents');
  return JSON.stringify(
    output.map(item => {
      const [document, score] = Array.isArray(item) ? item : [item];
      if (!isRecord(document))
        throw new TypeError('Expected a LangChain document');
      return {
        ...(typeof document.id === 'string' ? { id: document.id } : {}),
        ...(typeof score === 'number' && Number.isFinite(score)
          ? { score }
          : {}),
      };
    })
  );
}
