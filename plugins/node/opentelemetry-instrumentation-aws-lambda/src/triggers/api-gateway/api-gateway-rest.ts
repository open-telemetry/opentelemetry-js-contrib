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
import { Attributes, SpanKind } from '@opentelemetry/api';
import {
  SemanticAttributes,
  SemanticResourceAttributes,
} from '@opentelemetry/semantic-conventions';
import { xForwardProto } from '../../instrumentation';
import { LambdaTrigger, TriggerSpanInitializerResult } from '../common';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { finalizeApiGatewaySpan } from './common';
import { TriggerOrigin } from '../index';

function isRestApiGatewayEvent(event: any): event is APIGatewayProxyEvent {
  return (
    event &&
    typeof event === 'object' &&
    'resource' in event &&
    typeof event.resource === 'string' &&
    'requestContext' in event
  );
}

function initializeRestApiGatewaySpan(
  event: APIGatewayProxyEvent
): TriggerSpanInitializerResult {
  const {
    resource,
    requestContext,
    multiValueQueryStringParameters,
    multiValueHeaders,
    pathParameters,
    headers,
  } = event;
  const { httpMethod, domainName, path, accountId, identity, resourcePath } =
    requestContext;
  const attributes: Attributes = {
    [SemanticAttributes.FAAS_TRIGGER]: 'http',
    [SemanticAttributes.HTTP_METHOD]: httpMethod,
    [SemanticAttributes.HTTP_ROUTE]: resourcePath,
    [SemanticAttributes.HTTP_URL]: domainName + path,
    [SemanticAttributes.HTTP_SERVER_NAME]: domainName,
    [SemanticResourceAttributes.CLOUD_ACCOUNT_ID]: accountId,
  };

  if (identity?.sourceIp) {
    attributes[SemanticAttributes.NET_PEER_IP] = identity.sourceIp;
  }

  if (headers?.[xForwardProto]) {
    attributes[SemanticAttributes.HTTP_SCHEME] = headers[xForwardProto];
  }

  if (multiValueQueryStringParameters) {
    Object.assign(
      attributes,
      Object.fromEntries(
        Object.entries(multiValueQueryStringParameters).map(
          ([k, v]) => [`http.request.query.${k}`, v?.length == 1 ? v[0] : v] // We don't have a semantic attribute for query parameters, but would be useful nonetheless
        )
      )
    );
  }

  if (multiValueHeaders) {
    Object.assign(
      attributes,
      Object.fromEntries(
        Object.entries(multiValueHeaders).map(([headerName, headerValue]) => [
          // See https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/http/#http-request-and-response-headers
          `http.request.header.${headerName}`,
          headerValue?.length == 1 ? headerValue[0] : headerValue,
        ])
      )
    );
  }
  if (pathParameters) {
    Object.assign(
      attributes,
      Object.fromEntries(
        Object.entries(pathParameters).map(([paramKey, paramValue]) => [
          `http.request.parameters.${paramKey}`,
          paramValue,
        ])
      )
    );
  }

  const name = resource;
  const options = {
    kind: SpanKind.SERVER,
    attributes,
  };
  return { name, options, origin: TriggerOrigin.API_GATEWAY_REST };
}

export const ApiGatewayRestTrigger: LambdaTrigger<APIGatewayProxyEvent> = {
  validator: isRestApiGatewayEvent,
  initializer: initializeRestApiGatewaySpan,
  finalizer: finalizeApiGatewaySpan,
};
