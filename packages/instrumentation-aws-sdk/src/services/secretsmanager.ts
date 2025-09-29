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
import { Attributes, Span, SpanKind, Tracer } from '@opentelemetry/api';
import { ATTR_AWS_SECRETSMANAGER_SECRET_ARN } from '../semconv';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import {
  NormalizedRequest,
  NormalizedResponse,
  AwsSdkInstrumentationConfig,
} from '../types';

export class SecretsManagerServiceExtension implements ServiceExtension {
  requestPreSpanHook(
    request: NormalizedRequest,
    _config: AwsSdkInstrumentationConfig
  ): RequestMetadata {
    const secretId = request.commandInput?.SecretId;
    const spanKind: SpanKind = SpanKind.CLIENT;
    let spanName: string | undefined;
    const spanAttributes: Attributes = {};
    if (
      typeof secretId === 'string' &&
      secretId.startsWith('arn:aws:secretsmanager:')
    ) {
      spanAttributes[ATTR_AWS_SECRETSMANAGER_SECRET_ARN] = secretId;
    }

    return {
      isIncoming: false,
      spanAttributes,
      spanKind,
      spanName,
    };
  }

  responseHook(
    response: NormalizedResponse,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig
  ): void {
    const secretArn = response.data?.ARN;
    if (secretArn) {
      span.setAttribute(ATTR_AWS_SECRETSMANAGER_SECRET_ARN, secretArn);
    }
  }
}
