/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type Anthropic from '@anthropic-ai/sdk';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import type { AnthropicInstrumentationConfig } from './types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

type AnthropicModule = typeof Anthropic & {
  Anthropic?: typeof Anthropic;
  default?: typeof Anthropic;
};

interface SpanState {
  span: Span;
  ended: boolean;
}

function getAnthropicExport(module: AnthropicModule): typeof Anthropic {
  return module.Anthropic ?? module.default ?? module;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  );
}

export class AnthropicInstrumentation extends InstrumentationBase<AnthropicInstrumentationConfig> {
  constructor(config: AnthropicInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
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
        const span = instrumentation.tracer.startSpan(`chat ${params.model}`, {
          kind: SpanKind.CLIENT,
          attributes: {
            'gen_ai.operation.name': 'chat',
            'gen_ai.provider.name': 'anthropic',
            'gen_ai.request.model': params.model,
          },
        });
        const state: SpanState = { span, ended: false };
        const ctx = trace.setSpan(context.active(), span);

        let result: Promise<unknown>;
        try {
          result = context.with(ctx, () => original.apply(this, args));
        } catch (error) {
          instrumentation._endSpanWithError(state, error);
          throw error;
        }

        result.then(
          value => {
            if (isAsyncIterable(value)) {
              instrumentation._wrapStream(value, state);
            } else {
              instrumentation._endSpan(state);
            }
          },
          error => instrumentation._endSpanWithError(state, error)
        );

        // Preserve the Anthropic SDK's customized APIPromise instance.
        return result;
      };
    };
  }

  private _wrapStream(stream: AsyncIterable<unknown>, state: SpanState): void {
    const originalIterator = stream[Symbol.asyncIterator].bind(stream);
    this._wrap(stream, Symbol.asyncIterator, () => {
      return () => this._streamIterator(originalIterator(), state);
    });
  }

  private async *_streamIterator(
    iterator: AsyncIterator<unknown>,
    state: SpanState
  ): AsyncGenerator<unknown> {
    let exhausted = false;
    try {
      while (true) {
        const next = await iterator.next();
        if (next.done) {
          exhausted = true;
          break;
        }
        yield next.value;
      }
      this._endSpan(state);
    } catch (error) {
      this._endSpanWithError(state, error);
      throw error;
    } finally {
      if (!exhausted && !state.ended) {
        try {
          await iterator.return?.();
        } catch (error) {
          this._diag.debug('error closing Anthropic stream iterator:', error);
        }
        this._endSpan(state);
      }
    }
  }

  private _endSpan(state: SpanState): void {
    if (state.ended) return;
    state.ended = true;
    state.span.end();
  }

  private _endSpanWithError(state: SpanState, error: unknown): void {
    if (state.ended) return;
    const err = error instanceof Error ? error : new Error(String(error));
    state.span.recordException(err);
    state.span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    state.span.setAttribute('error.type', err.constructor.name);
    this._endSpan(state);
  }
}
