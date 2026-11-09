/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  Attributes,
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
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
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

type Invocation = InferenceInvocation | EmbeddingInvocation;

/**
 * Bedrock Runtime GenAI instrumentation, built on `@opentelemetry/genai-util`.
 *
 * The aws-sdk middleware owns the span: each GenAI invocation adopts it (via the
 * genai-util `span` option) to record GenAI attributes, status and metrics, and
 * never ends it. For streaming operations the middleware leaves the span open
 * and the stream wrapper ends it once the invocation has completed.
 */
export class BedrockRuntimeServiceExtension implements ServiceExtension {
  private _meter?: Meter;
  private _handler?: TelemetryHandler;
  private _handlerTracer?: Tracer;
  private _handlerCaptureMode?: string;
  private _diag: DiagLogger = diag;

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
        return this.requestPreSpanHookGenAI(request, false);
      case 'ConverseStream':
        return this.requestPreSpanHookGenAI(request, true);
      case 'InvokeModel':
        return this.requestPreSpanHookGenAI(request, false);
      case 'InvokeModelWithResponseStream':
        return this.requestPreSpanHookGenAI(request, true);
    }

    return {
      isIncoming: false,
    };
  }

  // Sets the span name and the attributes that should be visible to samplers.
  // The remaining GenAI attributes are recorded by the invocation.
  private requestPreSpanHookGenAI(
    request: NormalizedRequest,
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
    if (!isBedrockGenAICommand(request.commandName)) return;

    const handler = this.getHandler(tracer, config);
    const invocation = this.startInvocation(handler, request, span, startTime);
    if (!invocation) return;

    try {
      switch (request.commandName) {
        case 'Converse':
          return this.responseHookConverse(response, invocation as InferenceInvocation);
        case 'ConverseStream':
          return this.responseHookConverseStream(
            handler,
            response,
            span,
            invocation as InferenceInvocation
          );
        case 'InvokeModel':
          return this.responseHookInvokeModel(response, invocation);
        case 'InvokeModelWithResponseStream':
          return this.responseHookInvokeModelWithResponseStream(
            handler,
            response,
            span,
            invocation as InferenceInvocation
          );
      }
    } catch (err) {
      this._diag.error('Failed to record Bedrock response telemetry', err);
      invocation.stop();
    }
  }

  exceptionHook(
    request: NormalizedRequest,
    error: unknown,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig,
    startTime: HrTime
  ) {
    if (!isBedrockGenAICommand(request.commandName)) return;

    const handler = this.getHandler(tracer, config);
    const invocation = this.startInvocation(handler, request, span, startTime);
    invocation?.fail({
      exception: error instanceof Error ? error : undefined,
    });
  }

  private responseHookConverse(
    response: NormalizedResponse,
    invocation: InferenceInvocation
  ) {
    extractConverseResponse(
      response.data,
      invocation,
      invocation.shouldCaptureContent()
    );
    invocation.stop();
  }

  private responseHookConverseStream(
    handler: TelemetryHandler,
    response: NormalizedResponse,
    span: Span,
    invocation: InferenceInvocation
  ) {
    const stream = response.data?.stream;
    if (!stream) {
      invocation.stop();
      span.end();
      return;
    }
    return {
      ...response.data,
      // Wrap and replace the response stream to allow processing events to telemetry
      // before yielding to the user.
      stream: wrapConverseStream(
        handler,
        stream,
        span,
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
    invocation.stop();
  }

  private responseHookInvokeModelWithResponseStream(
    handler: TelemetryHandler,
    response: NormalizedResponse,
    span: Span,
    invocation: InferenceInvocation
  ) {
    const stream = response.data?.body;
    if (!stream) {
      invocation.stop();
      span.end();
      return;
    }
    // Replace the original response body with our instrumented stream, which
    // completes the invocation and ends the span once the stream is consumed.
    response.data.body = wrapInvokeModelStream(
      handler,
      stream,
      span,
      invocation,
      invocation.shouldCaptureContent()
    );
    return response.data;
  }

  // Starts the invocation on the middleware's span once the call has settled:
  // request data is available from the normalized request, and the start time
  // is the one the middleware recorded when starting the span.
  private startInvocation(
    handler: TelemetryHandler,
    request: NormalizedRequest,
    span: Span,
    startTime: HrTime
  ): Invocation | undefined {
    const input = request.commandInput ?? {};
    const modelId =
      typeof input.modelId === 'string' && input.modelId
        ? input.modelId
        : undefined;
    const { serverAddress, serverPort } = extractServerAddressAndPort(
      request.endpoint
    );
    const common = {
      providerName: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
      requestModel: modelId,
      serverAddress,
      serverPort,
      startTime,
      span,
    };

    try {
      if (isEmbeddingRequest(request)) {
        const data = extractEmbeddingRequest(input);
        return handler.startEmbedding({
          ...common,
          attributes: data.attributes,
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
        attributes: data.attributes,
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

function isBedrockGenAICommand(commandName: string): boolean {
  return (
    commandName === 'Converse' ||
    commandName === 'ConverseStream' ||
    commandName === 'InvokeModel' ||
    commandName === 'InvokeModelWithResponseStream'
  );
}

// Embedding models are only invoked through the non-streaming InvokeModel API.
function isEmbeddingRequest(request: NormalizedRequest): boolean {
  return (
    request.commandName === 'InvokeModel' &&
    isEmbeddingModel(request.commandInput?.modelId)
  );
}
