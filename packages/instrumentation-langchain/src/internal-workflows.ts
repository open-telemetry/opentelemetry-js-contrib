/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DiagLogger } from '@opentelemetry/api';
import { isRecord } from './content';

// Shared across instrumentation instances observing the same SDK objects.
// Factory-only adapters created before tracking cannot be inferred safely.
const internalWorkflows = new WeakSet<object>();
const trackingWrappers = new WeakSet<object>();

export function isInternalWorkflow(value: object): boolean {
  return internalWorkflows.has(value);
}

export function isTrackingFactory(value: object): boolean {
  return trackingWrappers.has(value);
}

export function ownValue(value: unknown, key: string): unknown {
  return isRecord(value)
    ? Object.getOwnPropertyDescriptor(value, key)?.value
    : undefined;
}

function unbind(value: unknown): unknown {
  const seen = new Set<object>();
  while (isRecord(value) && !seen.has(value)) {
    seen.add(value);
    const bound = ownValue(value, 'bound');
    if (!isRecord(bound)) break;
    value = bound;
  }
  return value;
}

export function markWorkflow(value: unknown): void {
  const runnable = unbind(value);
  if (isRecord(runnable)) internalWorkflows.add(runnable);
}

export function markStructuredOutput(
  value: unknown,
  includeRaw: unknown
): void {
  const sequence = unbind(value);
  markWorkflow(sequence);
  // Only the factory's synthetic { raw: llm } map, never the model child.
  if (includeRaw === true) markWorkflow(ownValue(sequence, 'first'));
}

function trackingProxy<F extends (...args: never[]) => unknown>(
  original: F,
  apply: (receiver: unknown, args: unknown[]) => unknown
): F {
  const metadata = new Map<PropertyKey, unknown>();
  const wrapped = new Proxy(original, {
    apply(_target, receiver: unknown, args: unknown[]) {
      return apply(receiver, args);
    },
    // Shimmer annotates its wrapper. Do not forward those writes to an
    // inherited SDK method shared by multiple owner classes.
    defineProperty(target, key, descriptor) {
      if (key === '__original' || key === '__unwrap' || key === '__wrapped') {
        metadata.set(key, descriptor.value);
        return true;
      }
      return Reflect.defineProperty(target, key, descriptor);
    },
    get(target, key, receiver) {
      return metadata.has(key)
        ? metadata.get(key)
        : Reflect.get(target, key, receiver);
    },
  });
  trackingWrappers.add(wrapped);
  return wrapped;
}

export function trackOwnedWorkflow(
  owner: abstract new (...args: never[]) => object,
  diag: DiagLogger
) {
  return <F extends (...args: never[]) => unknown>(original: F): F =>
    trackingProxy(original, (receiver, args) => {
      try {
        // Only these known SDK owner classes construct an adapter in bound.
        // Do not classify arbitrary bindings or their application children.
        if (receiver instanceof owner)
          markWorkflow(ownValue(receiver, 'bound'));
      } catch {
        diag.warn('LangChain: could not identify owned workflow adapter');
      }
      return Reflect.apply(original, receiver, args);
    });
}

export function trackFactory(
  observe: (result: unknown, receiver: unknown, args: unknown[]) => void,
  diag: DiagLogger
) {
  return <F extends (...args: never[]) => unknown>(original: F): F =>
    trackingProxy(original, (receiver, args) => {
      const result: unknown = Reflect.apply(original, receiver, args);
      try {
        observe(result, receiver, args);
      } catch {
        diag.warn('LangChain: could not identify internal workflow adapter');
      }
      return result;
    });
}
