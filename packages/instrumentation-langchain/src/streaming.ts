/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseMessageChunk } from '@langchain/core/messages';
import type { DiagLogger } from '@opentelemetry/api';
import { isRecord } from './content';

type IteratorMethod = 'next' | 'return' | 'throw';

function isIteratorResult(value: unknown): value is IteratorResult<unknown> {
  return (
    isRecord(value) &&
    (value.done === undefined || typeof value.done === 'boolean')
  );
}

/**
 * Observes an iterator in place, retaining its methods' receivers, arguments,
 * result objects and Promises. Never pulls ahead of the consumer.
 */
export function observeIterator(
  iterator: unknown,
  run: (method: IteratorMethod, invoke: () => unknown) => unknown,
  result: (method: IteratorMethod, value: IteratorResult<unknown>) => void,
  failure: (error: unknown) => void,
  unobserved: () => void,
  diag: DiagLogger
): () => void {
  if (!isRecord(iterator) || typeof iterator.next !== 'function')
    throw new TypeError('Expected a workflow iterator');
  const restores: Array<() => void> = [];
  let active = true;
  const stop = () => {
    active = false;
    for (const restore of restores) {
      try {
        restore();
      } catch {
        diag.warn('LangChain: could not restore workflow iterator method');
      }
    }
  };
  try {
    for (const method of ['next', 'return', 'throw'] as const) {
      const original = iterator[method];
      if (typeof original !== 'function') continue;
      const descriptor = Object.getOwnPropertyDescriptor(iterator, method);
      const restore = () => {
        if (
          Object.getOwnPropertyDescriptor(iterator, method)?.value !== wrapped
        )
          return;
        if (descriptor) Object.defineProperty(iterator, method, descriptor);
        else Reflect.deleteProperty(iterator, method);
      };
      const observe = (value: unknown) => {
        if (!active) return;
        try {
          if (!isIteratorResult(value))
            throw new TypeError('Expected an iterator result');
          result(method, value);
        } catch {
          diag.warn('LangChain: could not observe workflow iterator result');
          stop();
          unobserved();
        }
      };
      const reject = (error: unknown) => {
        if (!active) return;
        try {
          failure(error);
        } catch {
          diag.warn('LangChain: could not observe workflow iterator failure');
        }
      };
      const wrapped = function (this: unknown, ...args: unknown[]) {
        const invoke = () => Reflect.apply(original, this, args);
        if (!active) {
          restore();
          return invoke();
        }
        let value: unknown;
        try {
          value = run(method, invoke);
        } catch (error) {
          reject(error);
          throw error;
        }
        try {
          if (value instanceof Promise) {
            void value.then(observe, reject);
          } else {
            observe(value);
          }
        } catch {
          diag.warn('LangChain: could not observe workflow iterator Promise');
          stop();
          unobserved();
        }
        return value;
      };
      Object.defineProperty(iterator, method, {
        configurable: true,
        writable: true,
        value: wrapped,
      });
      restores.push(restore);
    }
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}

function isMessageChunk(value: unknown): value is BaseMessageChunk {
  return (
    isRecord(value) &&
    typeof value._getType === 'function' &&
    typeof value.concat === 'function'
  );
}

function concat(first: unknown, second: unknown): unknown {
  if (typeof first === 'string' && typeof second === 'string')
    return first + second;
  if (typeof first === 'number' && typeof second === 'number')
    return first + second;
  if (Array.isArray(first) && Array.isArray(second))
    return first.concat(second);
  if (isMessageChunk(first) && isMessageChunk(second))
    return first.concat(second);
  if (
    isRecord(first) &&
    isRecord(second) &&
    Object.getPrototypeOf(first) === Object.prototype &&
    Object.getPrototypeOf(second) === Object.prototype
  ) {
    const merged = { ...first };
    for (const [key, value] of Object.entries(second)) {
      Object.defineProperty(merged, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value:
          Object.prototype.hasOwnProperty.call(first, key) &&
          !Array.isArray(first[key])
            ? concat(first[key], value)
            : value,
      });
    }
    return merged;
  }
  throw new TypeError('Unsupported workflow chunk combination');
}

/** Accumulates only opt-in content, never retaining every individual chunk. */
export class StreamContent {
  private _value: unknown;
  private _seen = false;
  private _supported = true;

  constructor(private readonly _diag: DiagLogger) {}

  add(value: unknown) {
    if (!this._supported) return;
    try {
      this._value = this._seen ? concat(this._value, value) : value;
      this._seen = true;
    } catch {
      this._value = undefined;
      this._supported = false;
      this._diag.warn('LangChain: could not accumulate workflow content');
    }
  }

  take(): unknown {
    const value = this._value;
    this._value = undefined;
    return value;
  }
}
