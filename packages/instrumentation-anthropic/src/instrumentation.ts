/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type Anthropic from '@anthropic-ai/sdk';
import { context, trace } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import {
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC,
  TelemetryHandler,
  wrapAsyncStream,
} from '@opentelemetry/genai-util';
import type { AnthropicInstrumentationConfig } from './types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

type AnthropicModule = typeof Anthropic & {
  Anthropic?: typeof Anthropic;
  default?: typeof Anthropic;
};

function getAnthropicExport(module: AnthropicModule): typeof Anthropic {
  return module.Anthropic ?? module.default ?? module;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    Symbol.asyncIterator in value &&
    typeof (value as any)[Symbol.asyncIterator] === 'function'
  );
}

export class AnthropicInstrumentation extends InstrumentationBase<AnthropicInstrumentationConfig> {
  private _handler: TelemetryHandler;

  constructor(config: AnthropicInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    this._handler = new TelemetryHandler({
      tracer: this.tracer,
      meter: this.meter,
      diag: this._diag,
      config,
    });
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition(
        '@anthropic-ai/sdk',
        ['>=0.65.0 <1'],
        (module: AnthropicModule) => {
          const anthropic = getAnthropicExport(module);
          this._wrap(
            anthropic.Messages.prototype,
            'create',
            this._getPatchedMessagesCreate()
          );
          return module;
        },
        (module: AnthropicModule) => {
          const anthropic = getAnthropicExport(module);
          this._unwrap(anthropic.Messages.prototype, 'create');
        }
      ),
    ];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _getPatchedMessagesCreate(): any {
    const instrumentation = this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (original: any) => {
      return function patchedCreate(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this: any,
        ...args: unknown[]
      ) {
        if (!instrumentation.isEnabled()) {
          return original.apply(this, args);
        }

        const params = args[0] as Anthropic.Messages.MessageCreateParams;
        const invocation = instrumentation._handler.startInference({
          providerName: GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC,
          operationName: GEN_AI_OPERATION_NAME_VALUE_CHAT,
          requestModel: params?.model,
        });

        const span = invocation.getSpan();
        const ctx = trace.setSpan(context.active(), span);

        let result: Promise<unknown>;
        try {
          result = context.with(ctx, () => original.apply(this, args));
        } catch (error) {
          invocation.fail(error);
          throw error;
        }

        result.then(
          value => {
            if (isAsyncIterable(value)) {
              const originalIterator = value[Symbol.asyncIterator].bind(value);
              const wrapped = wrapAsyncStream(
                { [Symbol.asyncIterator]: originalIterator },
                invocation
              );
              instrumentation._wrap(value, Symbol.asyncIterator, () => {
                return () => wrapped[Symbol.asyncIterator]();
              });
            } else {
              invocation.stop();
            }
          },
          error => invocation.fail(error)
        );

        // Preserve the Anthropic SDK's customized APIPromise instance.
        return result;
      };
    };
  }
}
