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
import { SpanFinalizer } from '../common';
import { SpanStatusCode } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { APIGatewayProxyResult } from 'aws-lambda';

export function isGatewayResult(result: any): result is APIGatewayProxyResult {
  return (
    result &&
    typeof result === 'object' &&
    'statusCode' in result &&
    typeof result.statusCode === 'number'
  );
}

export const finalizeApiGatewaySpan: SpanFinalizer = (span, response) => {
  if (!isGatewayResult(response)) {
    return;
  }

  span.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, response.statusCode);
  const statusCode = response.statusCode;
  const errorStatusCodes = /^[45]\d\d$/;
  const fail = errorStatusCodes.test(String(statusCode));

  if (fail) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: 'Return to API Gateway with error ' + response.statusCode,
    });
  } else {
    span.setStatus({
      code: SpanStatusCode.OK,
    });
  }

  const { body } = response;

  if (body) {
    span.setAttribute(
      'http.response.body',
      typeof body === 'object' ? JSON.stringify(body) : body
    );
  }
};
