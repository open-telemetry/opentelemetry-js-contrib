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

import * as path from 'path';

import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import {
  Attributes,
  Context as OtelContext,
  context as otelContext,
  diag,
  Link,
  propagation,
  ROOT_CONTEXT,
  Span,
  SpanKind,
  SpanStatusCode,
  TextMapGetter,
  trace,
  TraceFlags,
  TracerProvider,
} from '@opentelemetry/api';
import {
  AWSXRAY_TRACE_ID_HEADER,
  AWSXRayPropagator,
} from '@opentelemetry/propagator-aws-xray';
import {
  SemanticAttributes,
  SemanticResourceAttributes,
} from '@opentelemetry/semantic-conventions';

import {
  APIGatewayProxyEventHeaders,
  Callback,
  Context,
  EventBridgeEvent,
  Handler,
  SQSEvent,
} from 'aws-lambda';

import { AwsLambdaInstrumentationConfig, EventContextExtractor } from './types';
import { VERSION } from './version';
import {
  GatewayResult,
  HttpApiGatewayEvent,
  isCognitoEvent,
  isDynamoDBStreamEvent,
  isEventBridgeEvent,
  isGatewayResult,
  isHttpApiGatewayEvent,
  isRestApiGatewayEvent,
  isS3Event,
  isSESEvent,
  isSNSEvent,
  isSQSEvent,
  LambdaAttributes,
  LambdaModule,
  RestApiGatewayEvent,
  TriggerOrigin,
} from './internal-types';
import { strict } from 'assert';
import { isDefined } from './utils';
import { SQSRecord } from 'aws-lambda/trigger/sqs';
import { SNSEvent } from 'aws-lambda/trigger/sns';
import { DynamoDBStreamEvent } from 'aws-lambda/trigger/dynamodb-stream';
import { DbSystemValues } from '@opentelemetry/semantic-conventions/build/src/trace/SemanticAttributes';
import { S3Event } from 'aws-lambda/trigger/s3';
import { SESEvent } from 'aws-lambda/trigger/ses';
import { BaseTriggerEvent as CognitoBaseTriggerEvent } from 'aws-lambda/trigger/cognito-user-pool-trigger/_common';
const awsPropagator = new AWSXRayPropagator();
const headerGetter: TextMapGetter<APIGatewayProxyEventHeaders> = {
  keys(carrier): string[] {
    return Object.keys(carrier);
  },
  get(carrier, key: string) {
    return carrier[key];
  },
};

export const traceContextEnvironmentKey = '_X_AMZN_TRACE_ID';
export const xForwardProto = 'X-Forwarded-Proto';

export class AwsLambdaInstrumentation extends InstrumentationBase {
  private _forceFlush?: () => Promise<void>;
  private triggerOrigin: TriggerOrigin | undefined;

  constructor(protected override _config: AwsLambdaInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-aws-lambda', VERSION, _config);
  }

  private sqsAttributes: Attributes = {
    [SemanticAttributes.FAAS_TRIGGER]: 'pubsub',
    [SemanticAttributes.MESSAGING_OPERATION]: 'process',
    [SemanticAttributes.MESSAGING_SYSTEM]: 'AmazonSQS',
    'messaging.source.kind': 'queue',
  };

  private snsAttributes: Attributes = {
    [SemanticAttributes.FAAS_TRIGGER]: 'pubsub',
    [SemanticAttributes.MESSAGING_OPERATION]: 'process',
    [SemanticAttributes.MESSAGING_SYSTEM]: 'AmazonSNS',
    'messaging.source.kind': 'topic',
  };

  private static getSQSRecordLink(record: SQSRecord): Link | undefined {
    const { AWSTraceHeader } = record?.attributes;
    if (!AWSTraceHeader) return undefined;
    const extractedContext = awsPropagator.extract(
      otelContext.active(),
      { [AWSXRAY_TRACE_ID_HEADER]: AWSTraceHeader },
      headerGetter
    );
    const context = trace.getSpan(extractedContext)?.spanContext();
    if (!context) return undefined;
    return { context };
  }

  override setConfig(config: AwsLambdaInstrumentationConfig = {}) {
    this._config = config;
  }

  init() {
    const taskRoot = process.env.LAMBDA_TASK_ROOT;
    const handlerDef = process.env._HANDLER;

    // _HANDLER and LAMBDA_TASK_ROOT are always defined in Lambda but guard bail out if in the future this changes.
    if (!taskRoot || !handlerDef) {
      return [];
    }

    const handler = path.basename(handlerDef);
    const moduleRoot = handlerDef.substr(0, handlerDef.length - handler.length);

    const [module, functionName] = handler.split('.', 2);

    // Lambda loads user function using an absolute path.
    let filename = path.resolve(taskRoot, moduleRoot, module);
    if (!filename.endsWith('.js')) {
      // Patching infrastructure currently requires a filename when requiring with an absolute path.
      filename += '.js';
    }

    return [
      new InstrumentationNodeModuleDefinition(
        // NB: The patching infrastructure seems to match names backwards, this must be the filename, while
        // InstrumentationNodeModuleFile must be the module name.
        filename,
        ['*'],
        undefined,
        undefined,
        [
          new InstrumentationNodeModuleFile(
            module,
            ['*'],
            (moduleExports: LambdaModule) => {
              diag.debug('Applying patch for lambda handler');
              if (isWrapped(moduleExports[functionName])) {
                this._unwrap(moduleExports, functionName);
              }
              this._wrap(moduleExports, functionName, this._getHandler());
              return moduleExports;
            },
            (moduleExports?: LambdaModule) => {
              if (moduleExports == undefined) return;
              diag.debug('Removing patch for lambda handler');
              this._unwrap(moduleExports, functionName);
            }
          ),
        ]
      ),
    ];
  }

  private _getHandler() {
    return (original: Handler) => {
      return this._getPatchHandler(original);
    };
  }

  private _getPatchHandler(original: Handler) {
    diag.debug('patch handler function');
    const plugin = this;

    return function patchedHandler(
      this: never,
      // The event can be a user type, it truly is any.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      event: any,
      context: Context,
      callback: Callback
    ) {
      const config = plugin._config;
      const parent = AwsLambdaInstrumentation._determineParent(
        event,
        context,
        config.disableAwsContextPropagation === true,
        config.eventContextExtractor ||
          AwsLambdaInstrumentation._defaultEventContextExtractor
      );

      const name = context.functionName;

      const { triggerSpan, triggerOrigin } =
        AwsLambdaInstrumentation._getTriggerSpan(plugin, event, parent) ?? {};
      plugin.triggerOrigin = triggerOrigin;

      const inner = (otelContextInstance: OtelContext) => {
        const lambdaSpan = plugin.tracer.startSpan(
          name,
          {
            kind: SpanKind.SERVER,
            attributes: {
              [SemanticAttributes.FAAS_EXECUTION]: context.awsRequestId,
              [SemanticResourceAttributes.FAAS_ID]: context.invokedFunctionArn,
              [SemanticResourceAttributes.CLOUD_ACCOUNT_ID]:
                AwsLambdaInstrumentation._extractAccountId(
                  context.invokedFunctionArn
                ),
            },
          },
          otelContextInstance
        );

        if (config.requestHook) {
          safeExecuteInTheMiddle(
            () => config.requestHook!(lambdaSpan, { event, context }),
            e => {
              if (e)
                diag.error('aws-lambda instrumentation: requestHook error', e);
            },
            true
          );
        }

        return otelContext.with(
          trace.setSpan(otelContextInstance, lambdaSpan),
          () => {
            // Lambda seems to pass a callback even if handler is of Promise form, so we wrap all the time before calling
            // the handler and see if the result is a Promise or not. In such a case, the callback is usually ignored. If
            // the handler happened to both call the callback and complete a returned Promise, whichever happens first will
            // win and the latter will be ignored.
            const wrappedCallback = plugin._wrapCallback(
              callback,
              lambdaSpan,
              triggerSpan
            );

            const maybePromise = safeExecuteInTheMiddle(
              () => original.apply(this, [event, context, wrappedCallback]),
              error => {
                if (error != null) {
                  // Exception thrown synchronously before resolving callback / promise.
                  // Callback may or may not have been called, we can't know for sure, but it doesn't matter, both will end the current span
                  plugin._applyResponseHook(lambdaSpan, error);
                  plugin._endSpan(lambdaSpan, error);
                }
              }
            ) as Promise<{}> | undefined;
            if (typeof maybePromise?.then === 'function') {
              return maybePromise.then(
                value => {
                  plugin._applyResponseHook(lambdaSpan, null, value);
                  plugin._endSpan(lambdaSpan, undefined);
                  return value;
                },
                (err: Error | string) => {
                  plugin._applyResponseHook(lambdaSpan, err);

                  plugin._endSpan(lambdaSpan, err);
                  throw err;
                }
              );
            }
            return maybePromise;
          }
        );
      };

      let handlerReturn: Promise<any> | undefined;
      if (!triggerSpan) {
        // No wrapper span
        try {
          handlerReturn = inner(parent);
        } catch (e) {
          // Catching a lambda that synchronously failed

          plugin._flush();
          throw e;
        }
      } else {
        const subCtx = trace.setSpan(parent, triggerSpan);
        handlerReturn = otelContext.with(subCtx, () => {
          return safeExecuteInTheMiddle(
            () => {
              const innerResult = inner(subCtx); // This call never fails, because it either returns a promise, or was called with safeExecuteInTheMiddle
              // The handler was an async, it returned a promise.
              if (typeof innerResult?.then === 'function') {
                return innerResult.then(
                  value => {
                    strict(triggerSpan);

                    plugin._endWrapperSpan(
                      triggerSpan,
                      value as GatewayResult | any,
                      undefined
                    );

                    return value;
                  },
                  async error => {
                    strict(triggerSpan);
                    await plugin._endWrapperSpan(triggerSpan, undefined, error);
                    throw error; // We don't want the instrumentation to hide the error from AWS
                  }
                );
              } else {
                // The lambda was synchronous, or it as synchronously thrown an error
                strict(triggerSpan);

                //if (hasLambdaSynchronouslyThrown) {
                plugin._endWrapperSpan(triggerSpan, innerResult, undefined);
                // }
                // Fallthrough: sync reply, but callback may be in use. No way to query the event loop !
              }

              return innerResult;
            },
            error => {
              if (error) {
                strict(triggerSpan);
                plugin._endWrapperSpan(triggerSpan, undefined, error);
                plugin._flush();
              }
            }
          );
        });
      }

      // Second case, lambda was asynchronous, in which case
      if (typeof handlerReturn?.then === 'function') {
        return handlerReturn.then(
          async success => {
            await plugin._flush();
            return success;
          },
          async error => {
            await plugin._flush();
            throw error;
          }
        );
      }

      // Third case, the lambda is purely synchronous, without event loop, nor callback() being called
      // Pitfall, no flushing !
      // We can't know for sure if the event loop is empty or not, so we can't know if we should flush or not.
      return handlerReturn;
    };
  }

  private static _getTriggerSpan(
    plugin: AwsLambdaInstrumentation,
    event: unknown,
    parentContext: OtelContext
  ): { triggerOrigin: TriggerOrigin; triggerSpan: Span } | undefined {
    if (plugin._config.detectTrigger === false) {
      return undefined;
    }

    if (isRestApiGatewayEvent(event)) {
      return {
        triggerOrigin: TriggerOrigin.API_GATEWAY_REST,
        triggerSpan: plugin._getRestApiGatewaySpan(event, parentContext),
      };
    } else if (isHttpApiGatewayEvent(event)) {
      return {
        triggerOrigin: TriggerOrigin.API_GATEWAY_HTTP,
        triggerSpan: plugin._getHttpApiGatewaySpan(event, parentContext),
      };
    } else if (isSQSEvent(event)) {
      return {
        triggerOrigin: TriggerOrigin.SQS,
        triggerSpan: plugin._getSQSSpan(event, parentContext),
      };
    } else if (isSNSEvent(event)) {
      return {
        triggerOrigin: TriggerOrigin.SNS,
        triggerSpan: plugin._getSNSSpan(event, parentContext),
      };
    } else if (isDynamoDBStreamEvent(event)) {
      return {
        triggerOrigin: TriggerOrigin.DYNAMO_DB_STREAM,
        triggerSpan: plugin._getDynamoDBStreamSpan(event, parentContext),
      };
    } else if (isS3Event(event)) {
      return {
        triggerOrigin: TriggerOrigin.S3,
        triggerSpan: plugin._getS3Span(event, parentContext),
      };
    } else if (isSESEvent(event)) {
      return {
        triggerOrigin: TriggerOrigin.SES,
        triggerSpan: plugin._getSESSpan(event, parentContext),
      };
    } else if (isCognitoEvent(event)) {
      return {
        triggerOrigin: TriggerOrigin.COGNITO,
        triggerSpan: plugin._getCognitoSpan(event, parentContext),
      };
    } else if (isEventBridgeEvent(event)) {
      return {
        triggerOrigin: TriggerOrigin.EVENT_BRIDGE,
        triggerSpan: plugin._getEventBridgeSpan(event, parentContext),
      };
    }
    return undefined;
  }

  private _getRestApiGatewaySpan(
    event: RestApiGatewayEvent,
    parent: OtelContext
  ) {
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
      [LambdaAttributes.TRIGGER_SERVICE]: TriggerOrigin.API_GATEWAY_REST,
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
            ([k, v]) => [`http.request.query.${k}`, v.length == 1 ? v[0] : v] // We don't have a semantic attribute for query parameters, but would be useful nonetheless
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
            headerValue.length == 1 ? headerValue[0] : headerValue,
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

    return this.tracer.startSpan(
      resource,
      {
        kind: SpanKind.SERVER,
        attributes: attributes,
      },
      parent
    );
  }

  private _getHttpApiGatewaySpan(
    event: HttpApiGatewayEvent,
    parent: OtelContext
  ) {
    const { rawPath, headers, requestContext } = event;
    const {
      http: { method, userAgent, sourceIp },
      domainName,
      accountId,
    } = requestContext;

    const attributes: Attributes = {
      [LambdaAttributes.TRIGGER_SERVICE]: TriggerOrigin.API_GATEWAY_HTTP,
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

    return this.tracer.startSpan(
      rawPath,
      {
        kind: SpanKind.SERVER,
        attributes: attributes,
      },
      parent
    );
  }

  private _getSQSSpan(event: SQSEvent, parent: OtelContext) {
    const { Records: records } = event;

    const sources = new Set(
      records.map(({ eventSourceARN }) => eventSourceARN)
    );

    const source =
      sources.size === 1 ? sources.values()!.next()!.value : 'multiple_sources';

    const attributes: Attributes = {
      [LambdaAttributes.TRIGGER_SERVICE]: TriggerOrigin.SQS,
      ...this.sqsAttributes,
      'messaging.source.name': source,
      'messaging.batch.message_count': records.length,
    };

    let links: Link[] | undefined = records
      .map(AwsLambdaInstrumentation.getSQSRecordLink)
      .filter(isDefined);

    links = links?.length === 0 ? undefined : links;

    return this.tracer.startSpan(
      `${source} process`,
      {
        kind: SpanKind.CONSUMER,
        attributes,
        links,
      },
      parent
    );
  }

  private _getSNSSpan(event: SNSEvent, parent: OtelContext) {
    const { Records: records } = event;

    const sources = new Set(records.map(({ Sns }) => Sns.TopicArn));

    const source =
      sources.size === 1 ? sources.values()!.next()!.value : 'multiple_sources';

    const attributes: Attributes = {
      [LambdaAttributes.TRIGGER_SERVICE]: TriggerOrigin.SNS,
      ...this.snsAttributes,
      'messaging.source.name': source,
      'messaging.batch.message_count': records.length,
    };

    return this.tracer.startSpan(
      `${source} process`,
      {
        kind: SpanKind.CONSUMER,
        attributes,
      },
      parent
    );
  }

  /*
    example of arn is:
    arn:aws:dynamodb:us-west-2:111122223333:table/TestTable/stream/2015-05-11T21:21:33.291
   */
  private static _getTablesFromDynamoARN(
    arn: string | undefined
  ): string | undefined {
    if (!arn) return undefined;
    try {
      const dynamoResource = arn.split(':')[4];
      const [dynamoResourceType, dynamoResourceName] =
        dynamoResource.split('/');
      if (dynamoResourceType === 'table') {
        return dynamoResourceName;
      }
      return undefined;
    } catch (error) {
      return undefined;
    }
  }

  private _getDynamoDBStreamSpan(
    event: DynamoDBStreamEvent,
    parent: OtelContext
  ) {
    const { Records: records } = event;

    const tableNames = Array.from(
      new Set(
        records
          .map(({ eventSourceARN }) =>
            AwsLambdaInstrumentation._getTablesFromDynamoARN(eventSourceARN)
          )
          .filter(isDefined)
      )
    );

    const attributes: Attributes = {
      [LambdaAttributes.TRIGGER_SERVICE]: TriggerOrigin.DYNAMO_DB_STREAM,
      [SemanticAttributes.DB_SYSTEM]: DbSystemValues.DYNAMODB,
    };

    if (tableNames.length > 0) {
      attributes[
        SemanticAttributes.AWS_DYNAMODB_TABLE_NAMES
      ] = `[${tableNames.join(', ')}]`;
    }

    return this.tracer.startSpan(
      'dynamo stream',
      {
        kind: SpanKind.CONSUMER,
        attributes,
      },
      parent
    );
  }

  private _getS3Span(event: S3Event, parent: OtelContext) {
    const { Records: records } = event;

    const eventNames = Array.from(
      new Set(records.map(({ eventName }) => eventName).filter(isDefined))
    );

    const buckets = Array.from(
      new Set(
        records
          .map(
            ({
              s3: {
                bucket: { name: bucketName },
              },
            }) => bucketName
          )
          .filter(isDefined)
      )
    );

    const s3objectKeys = Array.from(
      new Set(
        records
          .map(
            ({
              s3: {
                object: { key },
              },
            }) => key
          )
          .filter(isDefined)
      )
    );

    const attributes: Attributes = {
      [LambdaAttributes.TRIGGER_SERVICE]: TriggerOrigin.S3,
    };

    if (eventNames.length === 1) {
      attributes['aws.s3.event.trigger'] = eventNames[0];
    }

    if (buckets.length === 1) {
      attributes['aws.s3.bucket.name'] = buckets[0];
    }

    if (s3objectKeys.length === 1) {
      attributes['aws.s3.object.key'] = s3objectKeys[0];
    }

    const name =
      eventNames.length === 1 ? `${eventNames[0]}` : 's3 multi trigger';

    return this.tracer.startSpan(
      name,
      {
        kind: SpanKind.SERVER,
        attributes,
      },
      parent
    );
  }

  private _getSESSpan(event: SESEvent, parent: OtelContext) {
    const { Records: records } = event;
    const attributes: Attributes = {
      [LambdaAttributes.TRIGGER_SERVICE]: TriggerOrigin.SES,
    };

    if (records.length === 1) {
      const record = records[0];
      attributes['aws.ses.email.from'] =
        record.ses.mail.commonHeaders.from?.join(',');
      attributes['aws.ses.email.to'] =
        record.ses.mail.commonHeaders.to?.join(',');
    }

    return this.tracer.startSpan(
      'email',
      {
        kind: SpanKind.SERVER,
        attributes,
      },
      parent
    );
  }

  private _getCognitoSpan(
    event: CognitoBaseTriggerEvent<string>,
    parent: OtelContext
  ) {
    const attributes: Attributes = {
      [LambdaAttributes.TRIGGER_SERVICE]: TriggerOrigin.COGNITO,
      'aws.cognito.trigger.service': event.triggerSource,
    };

    return this.tracer.startSpan(
      `${event.triggerSource}`,
      {
        kind: SpanKind.SERVER,
        attributes,
      },
      parent
    );
  }

  private _getEventBridgeSpan(
    event: EventBridgeEvent<string, any>,
    parent: OtelContext
  ) {
    const attributes: Attributes = {
      [LambdaAttributes.TRIGGER_SERVICE]: TriggerOrigin.EVENT_BRIDGE,
      'aws.event.bridge.trigger.service': event.source,
    };

    return this.tracer.startSpan(
      event['detail-type'] ?? 'event bridge event',
      {
        kind: SpanKind.SERVER,
        attributes,
      },
      parent
    );
  }

  override setTracerProvider(tracerProvider: TracerProvider) {
    super.setTracerProvider(tracerProvider);
    this._forceFlush = this._getForceFlush(tracerProvider);
  }

  private async _endWrapperSpan(
    span: Span,
    lambdaResponse: GatewayResult | any,
    errorFromLambda: string | Error | null | undefined
  ) {
    if (errorFromLambda) {
      span.recordException(errorFromLambda);

      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: this._errorToString(errorFromLambda),
      });

      span.end();
      return;
    }

    if (
      this.triggerOrigin !== undefined &&
      [TriggerOrigin.API_GATEWAY_REST, TriggerOrigin.API_GATEWAY_HTTP].includes(
        this.triggerOrigin
      )
    ) {
      this._endAPIGatewaySpan(span, lambdaResponse);
    }
    span.end();
  }

  private _endAPIGatewaySpan(span: Span, lambdaResponse: GatewayResult | any) {
    if (!isGatewayResult(lambdaResponse)) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: 'Lambda return malformed value',
      });
      return;
    }

    span.setAttribute(
      SemanticAttributes.HTTP_STATUS_CODE,
      lambdaResponse.statusCode
    );
    const statusCode = lambdaResponse.statusCode;
    const errorStatusCodes = /^[45]\d\d$/;
    const fail = errorStatusCodes.test(String(statusCode));

    if (fail) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message:
          'Return to API Gateway with error ' + lambdaResponse.statusCode,
      });
    } else {
      span.setStatus({
        code: SpanStatusCode.OK,
      });
    }

    const { body } = lambdaResponse;

    if (body) {
      span.setAttribute(
        'http.response.body',
        typeof body === 'object' ? JSON.stringify(body) : body
      );
    }
  }

  private _getForceFlush(tracerProvider: TracerProvider) {
    if (!tracerProvider) return undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let currentProvider: any = tracerProvider;

    if (typeof currentProvider.getDelegate === 'function') {
      currentProvider = currentProvider.getDelegate();
    }

    if (typeof currentProvider.forceFlush === 'function') {
      return currentProvider.forceFlush.bind(currentProvider);
    }

    return undefined;
  }

  private _wrapCallback(
    originalAWSLambdaCallback: Callback,
    span: Span,
    wrapperSpan?: Span
  ): Callback {
    const plugin = this;
    return (err, res) => {
      diag.debug('executing wrapped lookup callback function');
      plugin._applyResponseHook(span, err, res);

      plugin._endSpan(span, err);
      if (wrapperSpan) {
        plugin._endWrapperSpan(wrapperSpan, res, err);
      }

      this._flush().then(() => {
        diag.debug('executing original lookup callback function');
        originalAWSLambdaCallback.apply(this, [err, res]); // End of the function
      });
    };
  }

  private async _flush() {
    if (this._forceFlush) {
      try {
        await this._forceFlush();
      } catch (e) {
        // We must not fail this call, but we may log it
        diag.error('Error while flushing the lambda', e);
      }
    } else {
      diag.error(
        'Spans may not be exported for the lambda function because we are not force flushing before callback.'
      );
    }
  }

  private _endSpan(span: Span, err: string | Error | null | undefined) {
    if (err) {
      span.recordException(err);
    }

    const errMessage = this._errorToString(err);
    if (errMessage) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errMessage,
      });
    }
    span.end();
  }

  private _errorToString(err: string | Error | null | undefined) {
    let errMessage;
    if (typeof err === 'string') {
      errMessage = err;
    } else if (err) {
      errMessage = err.message;
    }
    return errMessage;
  }

  private _applyResponseHook(
    span: Span,
    err?: Error | string | null,
    res?: any
  ) {
    if (this._config?.responseHook) {
      safeExecuteInTheMiddle(
        () => this._config.responseHook!(span, { err, res }),
        e => {
          if (e)
            diag.error('aws-lambda instrumentation: responseHook error', e);
        },
        true
      );
    }
  }

  private static _extractAccountId(arn: string): string | undefined {
    const parts = arn.split(':');
    if (parts.length >= 5) {
      return parts[4];
    }
    return undefined;
  }

  private static _defaultEventContextExtractor(event: any): OtelContext {
    // The default extractor tries to get sampled trace header from HTTP headers.
    const httpHeaders = event.headers || {};
    return propagation.extract(otelContext.active(), httpHeaders, headerGetter);
  }

  private static _determineParent(
    event: any,
    context: Context,
    disableAwsContextPropagation: boolean,
    eventContextExtractor: EventContextExtractor
  ): OtelContext {
    let parent: OtelContext | undefined = undefined;
    if (!disableAwsContextPropagation) {
      const lambdaTraceHeader = process.env[traceContextEnvironmentKey];
      if (lambdaTraceHeader) {
        parent = awsPropagator.extract(
          otelContext.active(),
          { [AWSXRAY_TRACE_ID_HEADER]: lambdaTraceHeader },
          headerGetter
        );
      }
      if (parent) {
        const spanContext = trace.getSpan(parent)?.spanContext();
        if (
          spanContext &&
          (spanContext.traceFlags & TraceFlags.SAMPLED) === TraceFlags.SAMPLED
        ) {
          // Trace header provided by Lambda only sampled if a sampled context was propagated from
          // an upstream cloud service such as S3, or the user is using X-Ray. In these cases, we
          // need to use it as the parent.
          return parent;
        }
      }
    }
    const extractedContext = safeExecuteInTheMiddle(
      () => eventContextExtractor(event, context),
      e => {
        if (e)
          diag.error(
            'aws-lambda instrumentation: eventContextExtractor error',
            e
          );
      },
      true
    );
    if (trace.getSpan(extractedContext)?.spanContext()) {
      return extractedContext;
    }
    if (!parent) {
      // No context in Lambda environment or HTTP headers.
      return ROOT_CONTEXT;
    }
    return parent;
  }
}
