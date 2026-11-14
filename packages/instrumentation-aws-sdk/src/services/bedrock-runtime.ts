/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  Attributes,
  Context,
  DiagLogger,
  diag,
  HrTime,
  Meter,
  Span,
  Tracer,
} from '@opentelemetry/api';
import {
  TelemetryHandler,
  type EmbeddingInvocation,
  type InferenceInvocation,
} from '@opentelemetry/genai-util';
import {
  ExtensionSpan,
  RequestMetadata,
  ServiceExtension,
} from './ServiceExtension';
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
} from '../semconv';
import {
  AwsSdkInstrumentationConfig,
  NormalizedRequest,
  NormalizedResponse,
} from '../types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from '../version';
import {
  extractConverseRequest,
  extractConverseResponse,
  extractEmbeddingRequest,
  extractEmbeddingResponse,
  extractInvokeModelRequest,
  extractInvokeModelResponse,
  extractServerAddressAndPort,
  isEmbeddingModel,
  parseBody,
} from './bedrock-runtime/extractors';
import {
  wrapConverseStream,
  wrapInvokeModelStream,
} from './bedrock-runtime/stream';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';

type Invocation = InferenceInvocation | EmbeddingInvocation;

/**
 * Bedrock Runtime GenAI instrumentation, built on `@opentelemetry/genai-util`.
 *
 * The extension owns the span (see `RequestMetadata.startSpan`): the GenAI
 * invocation is started before the request is sent, the request runs in the
 * invocation's context, and the invocation's `stop()` / `fail()` end the span.
 * The aws-sdk middleware only records its AWS attributes on it. For streaming
 * operations the stream wrapper completes the invocation once the stream is
 * consumed.
 */
export class BedrockRuntimeServiceExtension implements ServiceExtension {
  private _meter?: Meter;
  private _handler?: TelemetryHandler;
  private _handlerTracer?: Tracer;
  private _handlerCaptureMode?: string;
  private _diag: DiagLogger = diag;
  private readonly _invocations = new WeakMap<NormalizedRequest, Invocation>();

  updateMetricInstruments(meter: Meter) {
    this._meter = meter;
    this._handler = undefined;
  }

  requestPreSpanHook(
    request: NormalizedRequest,
    config: AwsSdkInstrumentationConfig,
    diag: DiagLogger
  ): RequestMetadata {
    switch (request.commandName) {
      case 'Converse':
        return this.requestPreSpanHookGenAI(request, config, false);
      case 'ConverseStream':
        return this.requestPreSpanHookGenAI(request, config, true);
      case 'InvokeModel':
        return this.requestPreSpanHookGenAI(request, config, false);
      case 'InvokeModelWithResponseStream':
        return this.requestPreSpanHookGenAI(request, config, true);
    }

    return {
      isIncoming: false,
    };
  }

  // The span is started by the GenAI invocation (`startSpan`). The span name and
  // attributes below are only used by the middleware if the invocation cannot
  // be started.
  private requestPreSpanHookGenAI(
    request: NormalizedRequest,
    config: AwsSdkInstrumentationConfig,
    isStream: boolean
  ): RequestMetadata {
    const modelId = request.commandInput?.modelId;
    const operationName = isEmbeddingRequest(request)
      ? GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS
      : GEN_AI_OPERATION_NAME_VALUE_CHAT;
    const spanAttributes: Attributes = {
      [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
      [ATTR_GEN_AI_OPERATION_NAME]: operationName,
    };
    if (modelId) {
      spanAttributes[ATTR_GEN_AI_REQUEST_MODEL] = modelId;
    }

    return {
      spanName: modelId ? `${operationName} ${modelId}` : operationName,
      isIncoming: false,
      isStream,
      spanAttributes,
      startSpan: (tracer, parentContext, attributes) =>
        this.startSpan(
          this.getHandler(tracer, config),
          request,
          parentContext,
          attributes
        ),
    };
  }

  private startSpan(
    handler: TelemetryHandler,
    request: NormalizedRequest,
    parentContext: Context,
    attributes: Attributes
  ): ExtensionSpan | undefined {
    const invocation = this.startInvocation(
      handler,
      request,
      parentContext,
      attributes
    );
    if (!invocation) return undefined;
    this._invocations.set(request, invocation);
    return {
      context: invocation.getContext(),
      end: () => invocation.stop(),
      fail: (error: unknown) => {
        // The endpoint has been resolved by the time the request fails.
        recordServerAddress(invocation, request.endpoint);
        const exception = error instanceof Error ? error : undefined;
        invocation.fail({
          exception,
          statusDescription: exception?.message,
        });
      },
    };
  }

  responseHook(
    response: NormalizedResponse,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig,
    startTime: HrTime
  ) {
    const request = response.request;
    const invocation = this._invocations.get(request);
    if (!invocation) return;
    recordServerAddress(invocation, request.endpoint);

    const handler = this.getHandler(tracer, config);
    try {
      switch (request.commandName) {
        case 'Converse':
          return this.responseHookConverse(
            response,
            invocation as InferenceInvocation
          );
        case 'ConverseStream':
          return this.responseHookConverseStream(
            handler,
            response,
            invocation as InferenceInvocation
          );
        case 'InvokeModel':
          return this.responseHookInvokeModel(response, invocation);
        case 'InvokeModelWithResponseStream':
          return this.responseHookInvokeModelWithResponseStream(
            handler,
            response,
            invocation as InferenceInvocation
          );
      }
    } catch (err) {
      this._diag.error('Failed to record Bedrock response telemetry', err);
      // The middleware does not end the span of a successful stream request.
      if (isStreamCommand(request.commandName)) invocation.stop();
    }
  }

  // For non-streaming operations, the middleware completes the invocation
  // (`ExtensionSpan.end`) once the response hooks have run.
  private responseHookConverse(
    response: NormalizedResponse,
    invocation: InferenceInvocation
  ) {
    extractConverseResponse(
      response.data,
      invocation,
      invocation.shouldCaptureContent()
    );
  }

  private responseHookConverseStream(
    handler: TelemetryHandler,
    response: NormalizedResponse,
    invocation: InferenceInvocation
  ) {
    const stream = response.data?.stream;
    if (!stream) {
      invocation.stop();
      return;
    }
    return {
      ...response.data,
      // Wrap and replace the response stream to allow processing events to telemetry
      // before yielding to the user.
      stream: wrapConverseStream(
        handler,
        stream,
        invocation,
        invocation.shouldCaptureContent()
      ),
    };
  }

  private responseHookInvokeModel(
    response: NormalizedResponse,
    invocation: Invocation
  ) {
    const body = parseBody(response.data?.body);
    if (isEmbeddingRequest(response.request)) {
      extractEmbeddingResponse(
        body,
        response.headers,
        invocation as EmbeddingInvocation
      );
    } else {
      const inference = invocation as InferenceInvocation;
      extractInvokeModelResponse(
        body,
        response.headers,
        inference,
        inference.shouldCaptureContent()
      );
    }
  }

  private responseHookInvokeModelWithResponseStream(
    handler: TelemetryHandler,
    response: NormalizedResponse,
    invocation: InferenceInvocation
  ) {
    const stream = response.data?.body;
    if (!stream) {
      invocation.stop();
      return;
    }
    // Replace the original response body with our instrumented stream, which
    // completes the invocation (ending its span) once the stream is consumed.
    response.data.body = wrapInvokeModelStream(
      handler,
      stream,
      invocation,
      invocation.shouldCaptureContent()
    );
    return response.data;
  }

  // Starts the invocation, and with it the span, before the request is sent.
  // `attributes` are the middleware's start attributes (rpc.*); the server
  // address and port are recorded once the endpoint has been resolved.
  private startInvocation(
    handler: TelemetryHandler,
    request: NormalizedRequest,
    parentContext: Context,
    attributes: Attributes
  ): Invocation | undefined {
    const input = request.commandInput ?? {};
    const modelId =
      typeof input.modelId === 'string' && input.modelId
        ? input.modelId
        : undefined;
    const common = {
      providerName: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
      requestModel: modelId,
      parentContext,
    };

    try {
      if (isEmbeddingRequest(request)) {
        const data = extractEmbeddingRequest(input);
        return handler.startEmbedding({
          ...common,
          attributes: { ...attributes, ...data.attributes },
          dimensionCount: data.dimensionCount,
          encodingFormats: data.encodingFormats,
        });
      }

      const captureContent = handler.shouldCaptureContent();
      const data =
        request.commandName === 'Converse' ||
        request.commandName === 'ConverseStream'
          ? extractConverseRequest(input, captureContent)
          : extractInvokeModelRequest(input, captureContent);
      return handler.startInference({
        ...common,
        operationName: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        attributes: { ...attributes, ...data.attributes },
        requestOptions: data.requestOptions,
        inputMessages: data.inputMessages,
        systemInstructions: data.systemInstructions,
      });
    } catch (err) {
      this._diag.error('Failed to start Bedrock GenAI invocation', err);
      return undefined;
    }
  }

  // The handler records metrics with the instrumentation's meter and is rebuilt
  // when the meter, the tracer or the content capture configuration changes.
  private getHandler(
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig
  ): TelemetryHandler {
    const captureMode = config.captureMessageContent;
    if (
      !this._handler ||
      this._handlerTracer !== tracer ||
      this._handlerCaptureMode !== captureMode
    ) {
      const meter = this._meter;
      this._handler = new TelemetryHandler({
        instrumentationName: PACKAGE_NAME,
        instrumentationVersion: PACKAGE_VERSION,
        tracerProvider: { getTracer: () => tracer },
        meterProvider: meter ? { getMeter: () => meter } : undefined,
        diag: this._diag,
        config: { captureMessageContent: captureMode },
      });
      this._handlerTracer = tracer;
      this._handlerCaptureMode = captureMode;
    }
    return this._handler;
  }
}

function isStreamCommand(commandName: string): boolean {
  return (
    commandName === 'ConverseStream' ||
    commandName === 'InvokeModelWithResponseStream'
  );
}

// `server.address` / `server.port` are both span attributes and metric
// dimensions, and only known once the request endpoint has been resolved.
function recordServerAddress(
  invocation: Invocation,
  endpoint: string | undefined
): void {
  const { serverAddress, serverPort } = extractServerAddressAndPort(endpoint);
  if (!serverAddress) return;
  const attributes: Attributes = { [ATTR_SERVER_ADDRESS]: serverAddress };
  if (serverPort !== undefined) attributes[ATTR_SERVER_PORT] = serverPort;
  invocation.setAttributes(attributes);
  invocation.setMetricAttributes(attributes);
}

// Embedding models are only invoked through the non-streaming InvokeModel API.
function isEmbeddingRequest(request: NormalizedRequest): boolean {
  return (
    request.commandName === 'InvokeModel' &&
    isEmbeddingModel(request.commandInput?.modelId)
  );
}
