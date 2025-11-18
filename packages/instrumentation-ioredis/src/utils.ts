/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Span, SpanStatusCode } from '@opentelemetry/api';

export const endSpan = (
  span: Span,
  err: NodeJS.ErrnoException | null | undefined
) => {
  if (err) {
    span.recordException(err);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message,
    });
  }
  span.end();
};

export const parseStartupNodes = (
  startupNodes?: Array<string | number | { host: string; port: number }>
): Array<string> => {
  if (!Array.isArray(startupNodes)) {
    return [];
  }

  return startupNodes.map(node => {
    if (typeof node === 'string') {
      return node;
    } else if (typeof node === 'number') {
      return `localhost:${node}`;
    } else {
      return `${node.host}:${node.port}`;
    }
  });
};
