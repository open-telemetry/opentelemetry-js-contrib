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
import { finalizeApiGatewaySpan } from './common';
import { APIGatewayProxyEventV2 } from 'aws-lambda/trigger/api-gateway-proxy';
import {TriggerOrigin} from "../index";

function isHttpApiGatewayEvent(event: any): event is APIGatewayProxyEventV2 {
  return (
    event &&
    typeof event === 'object' &&
    'rawPath' in event &&
    typeof event.rawPath === 'string' &&
    'requestContext' in event
  );
}

function initializeHttpApiGatewaySpan(
  event: APIGatewayProxyEventV2
): TriggerSpanInitializerResult {
  const { rawPath, headers, requestContext } = event;
  const {
    http: { method, userAgent, sourceIp },
    domainName,
    accountId,
  } = requestContext;

  const attributes: Attributes = {
    [SemanticAttributes.FAAS_TRIGGER]: 'http',
    [SemanticAttributes.HTTP_METHOD]: method,
    [SemanticAttributes.HTTP_TARGET]: rawPath,
    [SemanticAttributes.HTTP_URL]: domainName + rawPath,
    [SemanticAttributes.HTTP_SERVER_NAME]: domainName,
    [SemanticResourceAttributes.CLOUD_ACCOUNT_ID]: accountId,
  };

  if (userAgent) {
    attributes[SemanticAttributes.HTTP_USER_AGENT] = userAgent;
  }

  if (sourceIp) {
    attributes[SemanticAttributes.NET_PEER_IP] = sourceIp;
  }

  if (headers?.[xForwardProto]) {
    attributes[SemanticAttributes.HTTP_SCHEME] = headers[xForwardProto];
  }

  const name = rawPath;
  const options = {
    kind: SpanKind.SERVER,
    attributes: attributes,
  };
  return { name, options, origin: TriggerOrigin.API_GATEWAY_HTTP };
}

export const ApiGatewayHttpTrigger: LambdaTrigger<APIGatewayProxyEventV2> = {
  validator: isHttpApiGatewayEvent,
  initializer: initializeHttpApiGatewaySpan,
  finalizer: finalizeApiGatewaySpan,
};
