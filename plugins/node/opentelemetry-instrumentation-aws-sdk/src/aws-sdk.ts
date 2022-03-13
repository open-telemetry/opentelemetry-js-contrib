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
import {
  Span,
  SpanKind,
  context,
  trace,
  Context,
  diag,
  SpanStatusCode,
} from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import type * as AWS from 'aws-sdk';
import { AttributeNames } from './enums';
import { ServicesExtensions } from './services';
import {
  AwsSdkInstrumentationConfig,
  AwsSdkRequestHookInformation,
  AwsSdkResponseHookInformation,
  NormalizedRequest,
  NormalizedResponse,
} from './types';
import { VERSION } from './version';
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import type {
  MiddlewareStack,
  HandlerExecutionContext,
  Command as AwsV3Command,
  Handler as AwsV3MiddlewareHandler,
  InitializeHandlerArguments,
} from '@aws-sdk/types';
import {
  bindPromise,
  extractAttributesFromNormalizedRequest,
  normalizeV2Request,
  normalizeV3Request,
  removeSuffixFromStringIfExists,
} from './utils';
import { RequestMetadata } from './services/ServiceExtension';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

const V3_CLIENT_CONFIG_KEY = Symbol(
  'opentelemetry.instrumentation.aws-sdk.client.config'
);
type V3PluginCommand = AwsV3Command<any, any, any, any, any> & {
  [V3_CLIENT_CONFIG_KEY]?: any;
};

const REQUEST_SPAN_KEY = Symbol('opentelemetry.instrumentation.aws-sdk.span');
type V2PluginRequest = AWS.Request<any, any> & {
  [REQUEST_SPAN_KEY]?: Span;
};

export class AwsInstrumentation extends InstrumentationBase<typeof AWS> {
  static readonly component = 'aws-sdk';
  protected override _config!: AwsSdkInstrumentationConfig;
  private servicesExtensions: ServicesExtensions = new ServicesExtensions();

  constructor(config: AwsSdkInstrumentationConfig = {}) {
    super(
      '@opentelemetry/instrumentation-aws-sdk',
      VERSION,
      Object.assign({}, config)
    );
  }

  override setConfig(config: AwsSdkInstrumentationConfig = {}) {
    this._config = Object.assign({}, config);
  }

  protected init(): InstrumentationModuleDefinition<any>[] {
    const v3MiddlewareStackFileOldVersions = new InstrumentationNodeModuleFile(
      '@aws-sdk/middleware-stack/dist/cjs/MiddlewareStack.js',
      ['>=3.1.0 <3.35.0'],
      this.patchV3ConstructStack.bind(this),
      this.unpatchV3ConstructStack.bind(this)
    );
    const v3MiddlewareStackFileNewVersions = new InstrumentationNodeModuleFile(
      '@aws-sdk/middleware-stack/dist-cjs/MiddlewareStack.js',
      ['>=3.35.0'],
      this.patchV3ConstructStack.bind(this),
      this.unpatchV3ConstructStack.bind(this)
    );

    // as for aws-sdk v3.13.1, constructStack is exported from @aws-sdk/middleware-stack as
    // getter instead of function, which fails shimmer.
    // so we are patching the MiddlewareStack.js file directly to get around it.
    const v3MiddlewareStack = new InstrumentationNodeModuleDefinition<
      typeof AWS
    >('@aws-sdk/middleware-stack', ['^3.1.0'], undefined, undefined, [
      v3MiddlewareStackFileOldVersions,
      v3MiddlewareStackFileNewVersions,
    ]);

    const v3SmithyClient = new InstrumentationNodeModuleDefinition<typeof AWS>(
      '@aws-sdk/smithy-client',
      ['^3.1.0'],
      this.patchV3SmithyClient.bind(this),
      this.unpatchV3SmithyClient.bind(this)
    );

    const v2Request = new InstrumentationNodeModuleFile<typeof AWS>(
      'aws-sdk/lib/core.js',
      ['^2.308.0'],
      this.patchV2.bind(this),
      this.unpatchV2.bind(this)
    );

    const v2Module = new InstrumentationNodeModuleDefinition<typeof AWS>(
      'aws-sdk',
      ['^2.308.0'],
      undefined,
      undefined,
      [v2Request]
    );

    return [v2Module, v3MiddlewareStack, v3SmithyClient];
  }

  protected patchV3ConstructStack(moduleExports: any, moduleVersion?: string) {
    diag.debug(
      'aws-sdk instrumentation: applying patch to aws-sdk v3 constructStack'
    );
    this._wrap(
      moduleExports,
      'constructStack',
      this._getV3ConstructStackPatch.bind(this, moduleVersion)
    );
    return moduleExports;
  }

  protected unpatchV3ConstructStack(moduleExports: any) {
    diag.debug(
      'aws-sdk instrumentation: applying unpatch to aws-sdk v3 constructStack'
    );
    this._unwrap(moduleExports, 'constructStack');
    return moduleExports;
  }

  protected patchV3SmithyClient(moduleExports: any) {
    diag.debug(
      'aws-sdk instrumentation: applying patch to aws-sdk v3 client send'
    );
    this._wrap(
      moduleExports.Client.prototype,
      'send',
      this._getV3SmithyClientSendPatch.bind(this)
    );
    return moduleExports;
  }

  protected unpatchV3SmithyClient(moduleExports: any) {
    diag.debug(
      'aws-sdk instrumentation: applying patch to aws-sdk v3 constructStack'
    );
    this._unwrap(moduleExports.Client.prototype, 'send');
    return moduleExports;
  }

  protected patchV2(moduleExports: typeof AWS, moduleVersion?: string) {
    diag.debug(
      `aws-sdk instrumentation: applying patch to ${AwsInstrumentation.component}`
    );
    this.unpatchV2(moduleExports);
    this._wrap(
      moduleExports?.Request.prototype,
      'send',
      this._getRequestSendPatch.bind(this, moduleVersion)
    );
    this._wrap(
      moduleExports?.Request.prototype,
      'promise',
      this._getRequestPromisePatch.bind(this, moduleVersion)
    );

    return moduleExports;
  }

  protected unpatchV2(moduleExports?: typeof AWS) {
    if (isWrapped(moduleExports?.Request.prototype.send)) {
      this._unwrap(moduleExports!.Request.prototype, 'send');
    }
    if (isWrapped(moduleExports?.Request.prototype.promise)) {
      this._unwrap(moduleExports!.Request.prototype, 'promise');
    }
  }

  private _startAwsV3Span(
    normalizedRequest: NormalizedRequest,
    metadata: RequestMetadata
  ): Span {
    const name =
      metadata.spanName ??
      `${normalizedRequest.serviceName}.${normalizedRequest.commandName}`;
    const newSpan = this.tracer.startSpan(name, {
      kind: metadata.spanKind,
      attributes: {
        ...extractAttributesFromNormalizedRequest(normalizedRequest),
        ...metadata.spanAttributes,
      },
    });

    return newSpan;
  }

  private _startAwsV2Span(
    request: AWS.Request<any, any>,
    metadata: RequestMetadata,
    normalizedRequest: NormalizedRequest
  ): Span {
    const operation = (request as any).operation;
    const service = (request as any).service;
    const serviceIdentifier = service?.serviceIdentifier;
    const name =
      metadata.spanName ??
      `${normalizedRequest.serviceName}.${normalizedRequest.commandName}`;

    const newSpan = this.tracer.startSpan(name, {
      kind: metadata.spanKind ?? SpanKind.CLIENT,
      attributes: {
        [AttributeNames.AWS_OPERATION]: operation,
        [AttributeNames.AWS_SIGNATURE_VERSION]:
          service?.config?.signatureVersion,
        [AttributeNames.AWS_SERVICE_API]: service?.api?.className,
        [AttributeNames.AWS_SERVICE_IDENTIFIER]: serviceIdentifier,
        [AttributeNames.AWS_SERVICE_NAME]: service?.api?.abbreviation,
        ...extractAttributesFromNormalizedRequest(normalizedRequest),
        ...metadata.spanAttributes,
      },
    });

    return newSpan;
  }

  private _callUserPreRequestHook(
    span: Span,
    request: NormalizedRequest,
    moduleVersion: string | undefined
  ) {
    if (this._config?.preRequestHook) {
      const requestInfo: AwsSdkRequestHookInformation = {
        moduleVersion,
        request,
      };
      safeExecuteInTheMiddle(
        () => this._config.preRequestHook!(span, requestInfo),
        (e: Error | undefined) => {
          if (e)
            diag.error(
              `${AwsInstrumentation.component} instrumentation: preRequestHook error`,
              e
            );
        },
        true
      );
    }
  }

  private _callUserResponseHook(span: Span, response: NormalizedResponse) {
    const responseHook = this._config?.responseHook;
    if (!responseHook) return;

    const responseInfo: AwsSdkResponseHookInformation = {
      response,
    };
    safeExecuteInTheMiddle(
      () => responseHook(span, responseInfo),
      (e: Error | undefined) => {
        if (e)
          diag.error(
            `${AwsInstrumentation.component} instrumentation: responseHook error`,
            e
          );
      },
      true
    );
  }

  private _registerV2CompletedEvent(
    span: Span,
    v2Request: V2PluginRequest,
    normalizedRequest: NormalizedRequest,
    completedEventContext: Context
  ) {
    const self = this;
    v2Request.on('complete', response => {
      // read issue https://github.com/aspecto-io/opentelemetry-ext-js/issues/60
      context.with(completedEventContext, () => {
        if (!v2Request[REQUEST_SPAN_KEY]) {
          return;
        }
        delete v2Request[REQUEST_SPAN_KEY];

        const requestId = response.requestId;
        const normalizedResponse: NormalizedResponse = {
          data: response.data,
          request: normalizedRequest,
          requestId: requestId,
        };

        self._callUserResponseHook(span, normalizedResponse);
        if (response.error) {
          span.setAttribute(AttributeNames.AWS_ERROR, response.error);
        } else {
          this.servicesExtensions.responseHook(
            normalizedResponse,
            span,
            self.tracer,
            self._config
          );
        }

        span.setAttribute(AttributeNames.AWS_REQUEST_ID, requestId);

        const httpStatusCode = response.httpResponse?.statusCode;
        if (httpStatusCode) {
          span.setAttribute(
            SemanticAttributes.HTTP_STATUS_CODE,
            httpStatusCode
          );
        }
        span.end();
      });
    });
  }

  private _getV3ConstructStackPatch(
    moduleVersion: string | undefined,
    original: (...args: unknown[]) => MiddlewareStack<any, any>
  ) {
    const self = this;
    return function constructStack(
      this: any,
      ...args: unknown[]
    ): MiddlewareStack<any, any> {
      const stack: MiddlewareStack<any, any> = original.apply(this, args);
      self.patchV3MiddlewareStack(moduleVersion, stack);
      return stack;
    };
  }

  private _getV3SmithyClientSendPatch(
    original: (...args: unknown[]) => Promise<any>
  ) {
    return function send(
      this: any,
      command: V3PluginCommand,
      ...args: unknown[]
    ): Promise<any> {
      command[V3_CLIENT_CONFIG_KEY] = this.config;
      return original.apply(this, [command, ...args]);
    };
  }

  private patchV3MiddlewareStack(
    moduleVersion: string | undefined,
    middlewareStackToPatch: MiddlewareStack<any, any>
  ) {
    if (!isWrapped(middlewareStackToPatch.resolve)) {
      this._wrap(
        middlewareStackToPatch,
        'resolve',
        this._getV3MiddlewareStackResolvePatch.bind(this, moduleVersion)
      );
    }

    // 'clone' and 'concat' functions are internally calling 'constructStack' which is in same
    // module, thus not patched, and we need to take care of it specifically.
    this._wrap(
      middlewareStackToPatch,
      'clone',
      this._getV3MiddlewareStackClonePatch.bind(this, moduleVersion)
    );
    this._wrap(
      middlewareStackToPatch,
      'concat',
      this._getV3MiddlewareStackClonePatch.bind(this, moduleVersion)
    );
  }

  private _getV3MiddlewareStackClonePatch(
    moduleVersion: string | undefined,
    original: (...args: any[]) => MiddlewareStack<any, any>
  ) {
    const self = this;
    return function (this: any, ...args: any[]) {
      const newStack = original.apply(this, args);
      self.patchV3MiddlewareStack(moduleVersion, newStack);
      return newStack;
    };
  }

  private _getV3MiddlewareStackResolvePatch(
    moduleVersion: string | undefined,
    original: (
      _handler: any,
      context: HandlerExecutionContext
    ) => AwsV3MiddlewareHandler<any, any>
  ) {
    const self = this;
    return function (
      this: any,
      _handler: any,
      awsExecutionContext: HandlerExecutionContext
    ): AwsV3MiddlewareHandler<any, any> {
      const origHandler = original.call(this, _handler, awsExecutionContext);
      const patchedHandler = function (
        this: any,
        command: InitializeHandlerArguments<any> & {
          [V3_CLIENT_CONFIG_KEY]?: any;
        }
      ): Promise<any> {
        const clientConfig = command[V3_CLIENT_CONFIG_KEY];
        const regionPromise = clientConfig?.region?.();
        const serviceName =
          clientConfig?.serviceId ??
          removeSuffixFromStringIfExists(
            awsExecutionContext.clientName,
            'Client'
          );
        const commandName =
          awsExecutionContext.commandName ?? command.constructor?.name;
        const normalizedRequest = normalizeV3Request(
          serviceName,
          commandName,
          command.input,
          undefined
        );
        const requestMetadata =
          self.servicesExtensions.requestPreSpanHook(normalizedRequest);
        const span = self._startAwsV3Span(normalizedRequest, requestMetadata);
        const activeContextWithSpan = trace.setSpan(context.active(), span);

        const handlerPromise = new Promise((resolve, reject) => {
          Promise.resolve(regionPromise)
            .then(resolvedRegion => {
              normalizedRequest.region = resolvedRegion;
              span.setAttribute(AttributeNames.AWS_REGION, resolvedRegion);
            })
            .catch(e => {
              // there is nothing much we can do in this case.
              // we'll just continue without region
              diag.debug(
                `${AwsInstrumentation.component} instrumentation: failed to extract region from async function`,
                e
              );
            })
            .finally(() => {
              self._callUserPreRequestHook(
                span,
                normalizedRequest,
                moduleVersion
              );
              const resultPromise = context.with(activeContextWithSpan, () => {
                self.servicesExtensions.requestPostSpanHook(normalizedRequest);
                return self._callOriginalFunction(() =>
                  origHandler.call(this, command)
                );
              });
              const promiseWithResponseLogic = resultPromise
                .then(response => {
                  const requestId = response.output?.$metadata?.requestId;
                  if (requestId) {
                    span.setAttribute(AttributeNames.AWS_REQUEST_ID, requestId);
                  }

                  const httpStatusCode =
                    response.output?.$metadata?.httpStatusCode;
                  if (httpStatusCode) {
                    span.setAttribute(
                      SemanticAttributes.HTTP_STATUS_CODE,
                      httpStatusCode
                    );
                  }

                  const extendedRequestId =
                    response.output?.$metadata?.extendedRequestId;
                  if (extendedRequestId) {
                    span.setAttribute(
                      AttributeNames.AWS_REQUEST_EXTENDED_ID,
                      extendedRequestId
                    );
                  }

                  const normalizedResponse: NormalizedResponse = {
                    data: response.output,
                    request: normalizedRequest,
                    requestId: requestId,
                  };
                  self.servicesExtensions.responseHook(
                    normalizedResponse,
                    span,
                    self.tracer,
                    self._config
                  );
                  self._callUserResponseHook(span, normalizedResponse);
                  return response;
                })
                .catch(err => {
                  const requestId = err?.RequestId;
                  if (requestId) {
                    span.setAttribute(AttributeNames.AWS_REQUEST_ID, requestId);
                  }
                  const extendedRequestId = err?.extendedRequestId;
                  if (extendedRequestId) {
                    span.setAttribute(
                      AttributeNames.AWS_REQUEST_EXTENDED_ID,
                      extendedRequestId
                    );
                  }

                  span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: err.message,
                  });
                  span.recordException(err);
                  throw err;
                })
                .finally(() => {
                  span.end();
                });
              promiseWithResponseLogic
                .then(res => {
                  resolve(res);
                })
                .catch(err => reject(err));
            });
        });

        return requestMetadata.isIncoming
          ? bindPromise(handlerPromise, activeContextWithSpan, 2)
          : handlerPromise;
      };
      return patchedHandler;
    };
  }

  private _getRequestSendPatch(
    moduleVersion: string | undefined,
    original: (callback?: (err: any, data: any) => void) => void
  ) {
    const self = this;
    return function (
      this: V2PluginRequest,
      callback?: (err: any, data: any) => void
    ) {
      /*
        if the span was already started, we don't want to start a new one
        when Request.promise() is called
      */
      if (this[REQUEST_SPAN_KEY]) {
        return original.call(this, callback);
      }

      const normalizedRequest = normalizeV2Request(this);
      const requestMetadata =
        self.servicesExtensions.requestPreSpanHook(normalizedRequest);
      const span = self._startAwsV2Span(
        this,
        requestMetadata,
        normalizedRequest
      );
      this[REQUEST_SPAN_KEY] = span;
      const activeContextWithSpan = trace.setSpan(context.active(), span);
      const callbackWithContext = context.bind(activeContextWithSpan, callback);

      self._callUserPreRequestHook(span, normalizedRequest, moduleVersion);
      self._registerV2CompletedEvent(
        span,
        this,
        normalizedRequest,
        activeContextWithSpan
      );

      return context.with(activeContextWithSpan, () => {
        self.servicesExtensions.requestPostSpanHook(normalizedRequest);
        return self._callOriginalFunction(() =>
          original.call(this, callbackWithContext)
        );
      });
    };
  }

  private _getRequestPromisePatch(
    moduleVersion: string | undefined,
    original: (...args: unknown[]) => Promise<any>
  ) {
    const self = this;
    return function (this: V2PluginRequest, ...args: unknown[]): Promise<any> {
      // if the span was already started, we don't want to start a new one when Request.promise() is called
      if (this[REQUEST_SPAN_KEY]) {
        return original.apply(this, args);
      }

      const normalizedRequest = normalizeV2Request(this);
      const requestMetadata =
        self.servicesExtensions.requestPreSpanHook(normalizedRequest);
      const span = self._startAwsV2Span(
        this,
        requestMetadata,
        normalizedRequest
      );
      this[REQUEST_SPAN_KEY] = span;

      const activeContextWithSpan = trace.setSpan(context.active(), span);
      self._callUserPreRequestHook(span, normalizedRequest, moduleVersion);
      self._registerV2CompletedEvent(
        span,
        this,
        normalizedRequest,
        activeContextWithSpan
      );

      const origPromise: Promise<any> = context.with(
        activeContextWithSpan,
        () => {
          self.servicesExtensions.requestPostSpanHook(normalizedRequest);
          return self._callOriginalFunction(() =>
            original.call(this, arguments)
          );
        }
      );

      return requestMetadata.isIncoming
        ? bindPromise(origPromise, activeContextWithSpan)
        : origPromise;
    };
  }

  private _callOriginalFunction<T>(originalFunction: (...args: any[]) => T): T {
    if (this._config?.suppressInternalInstrumentation) {
      return context.with(suppressTracing(context.active()), originalFunction);
    } else {
      return originalFunction();
    }
  }
}
