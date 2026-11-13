/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { DiagLogger } from '@opentelemetry/api';
import { isRecord } from './content';
import {
  isTrackingFactory,
  markAgentPromptComposition,
  markWorkflow,
  ownValue,
  trackingProxy,
} from './internal-workflows';

// The prebuilt agent's private prompt factory runs lazily in its model node.
// Keep construction ownership separate from tracing, including while disabled.
const modelConstruction = new AsyncLocalStorage<boolean>();

/** Identifies callable SDK values before installing tracking wrappers. */
function isCallable(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function';
}

/**
 * Suspends SDK construction tracking while application code runs, so its
 * workflows are not mistaken for internal agent pipelines.
 */
function outsideConstruction<F extends (...args: never[]) => unknown>(
  original: F
): F {
  return trackingProxy(original, (receiver, args) => {
    const invoke = () => Reflect.apply(original, receiver, args);
    return modelConstruction.getStore()
      ? modelConstruction.run(false, invoke)
      : invoke();
  });
}

/**
 * Wraps an application-owned model method outside construction tracking,
 * optionally observing its result without replacing the returned value or Promise.
 */
function applicationMethod(
  target: object,
  key: string,
  diag: DiagLogger,
  observe?: (value: unknown) => void
) {
  let owner: object | null = target;
  let descriptor: PropertyDescriptor | undefined;
  while (owner && !descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(owner, key);
    owner = Object.getPrototypeOf(owner);
  }
  if (!descriptor) return;
  if (!('value' in descriptor))
    throw new TypeError('Accessor-backed prebuilt agent method');
  const original: unknown = descriptor.value;
  if (!isCallable(original) || isTrackingFactory(original)) return;
  const application = outsideConstruction(original);
  const observed = (value: unknown) => {
    try {
      observe?.(value);
    } catch {
      diag.warn('LangChain: could not track prebuilt agent model');
    }
  };
  Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value: observe
      ? trackingProxy(application, (receiver, args) => {
          const result: unknown = Reflect.apply(application, receiver, args);
          try {
            if (result instanceof Promise) {
              void result.then(observed, () => {});
            } else {
              observed(result);
            }
          } catch {
            diag.warn('LangChain: could not observe prebuilt agent model');
          }
          return result;
        })
      : application,
  });
}

/**
 * Finds model hooks through bindings and sequences, avoiding cycles and keeping
 * application-created compositions out of internal workflow tracking.
 */
function trackModel(
  value: unknown,
  diag: DiagLogger,
  seen = new Set<object>()
) {
  if (!isRecord(value) || seen.has(value)) return;
  seen.add(value);
  applicationMethod(value, 'bindTools', diag);
  applicationMethod(value, '_model', diag, model => trackModel(model, diag));
  for (const key of ['bound', 'first', 'last']) {
    trackModel(ownValue(value, key), diag, seen);
  }
  const middle = ownValue(value, 'middle');
  if (Array.isArray(middle)) {
    for (const step of middle) trackModel(step, diag, seen);
  }
}

/**
 * Marks the prebuilt agent graph as internal and tracks its lazy model-node
 * construction, excluding application model factories and hooks from that scope.
 */
export function trackReactAgentFactory(diag: DiagLogger) {
  return <F extends (...args: never[]) => unknown>(original: F): F =>
    trackingProxy(original, (receiver, args) => {
      let prepared = false;
      try {
        const params = args[0];
        const model = ownValue(params, 'llm');
        if (isRecord(params) && isCallable(model)) {
          const descriptors = Object.getOwnPropertyDescriptors(params);
          descriptors.llm = {
            ...descriptors.llm,
            value: outsideConstruction(model),
          };
          args[0] = Object.create(Object.getPrototypeOf(params), descriptors);
          prepared = true;
        } else if (isRecord(model)) {
          trackModel(model, diag);
          prepared = true;
        }
      } catch {
        diag.warn('LangChain: could not track prebuilt agent model setup');
      }
      const result: unknown = Reflect.apply(original, receiver, args);
      try {
        markWorkflow(result);
        if (prepared) {
          const node = ownValue(
            ownValue(ownValue(result, 'nodes'), 'agent'),
            'bound'
          );
          const func = ownValue(node, 'func');
          if (!isRecord(node) || !isCallable(func))
            throw new TypeError('Unsupported prebuilt agent model node');
          if (!isTrackingFactory(func)) {
            Object.defineProperty(node, 'func', {
              configurable: true,
              writable: true,
              value: trackingProxy(func, (nodeReceiver, nodeArgs) =>
                modelConstruction.run(true, () =>
                  Reflect.apply(func, nodeReceiver, nodeArgs)
                )
              ),
            });
          }
        }
      } catch {
        diag.warn('LangChain: could not track prebuilt agent model node');
      }
      return result;
    });
}

/**
 * Marks pipelines composed during SDK model-node construction as internal,
 * then suspends construction tracking when those pipelines execute.
 */
export function trackAgentComposition(diag: DiagLogger) {
  return <F extends (...args: never[]) => unknown>(original: F): F => {
    const application = outsideConstruction(original);
    return trackingProxy(original, (receiver, args) => {
      const internal = modelConstruction.getStore() === true;
      const result: unknown = Reflect.apply(application, receiver, args);
      try {
        markAgentPromptComposition(result, receiver);
        if (internal && isRecord(result)) {
          // Stop construction tracking before callbacks, prompts or models run.
          applicationMethod(result, 'invoke', diag);
          markWorkflow(result);
        }
      } catch {
        diag.warn('LangChain: could not identify internal agent pipeline');
      }
      return result;
    });
  };
}
