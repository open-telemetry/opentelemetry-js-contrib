/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { context, type Context } from '@opentelemetry/api';
import { isTracingSuppressed, suppressTracing } from '@opentelemetry/core';
import {
  ACTIVE_AGENT_CONTEXT_KEY,
  activeRuns,
  findEnclosingAgentRun,
  resolveActiveCallerContext,
  resolveParentContext,
} from './context';
import type {
  AnyInvocation,
  BeeAIRunLike,
  MethodPatch,
  PatchOwner,
  RunOperationSpec,
  StartedRunOperation,
} from './internal-types';
import { isRecord } from './utils';

const methodPatches = new WeakMap<object, Map<PropertyKey, MethodPatch>>();
const wrappedRuns = new WeakSet<object>();

/**
 * Patches a BeeAI prototype method returning a `Run` with telemetry lifecycle
 * handling defined by `spec`.
 */
export function patchRunMethod<
  T extends object,
  K extends keyof T,
  TInvocation extends AnyInvocation,
>(
  owner: PatchOwner,
  target: T,
  method: K,
  spec: RunOperationSpec<TInvocation>
): void {
  patchMethod(
    owner,
    target,
    method,
    createRunMethodWrapper<T[K], TInvocation>(target, method, spec)
  );
}

/**
 * Unregisters `owner` from `target[method]` and restores the original method
 * when no owners remain.
 */
export function unpatchMethod(
  owner: PatchOwner,
  target: object,
  method: 'run' | 'create' | 'createStructure'
): void {
  const patches = methodPatches.get(target);
  if (!patches) return;
  const patch = patches.get(method);
  if (!patch?.owners.delete(owner)) return;
  patch.restore();
}

/**
 * Applies an owner-tracked patch to `target[method]` so multiple
 * `BeeAIInstrumentation` instances can share a single wrapper safely.
 *
 * @param owner - Patch owner handle registering interest in `target[method]`.
 * @param target - Prototype or object whose method is being patched.
 * @param method - Property key of the method on `target` to wrap.
 * @param factory - Wrapper builder invoked with the original method to
 *   produce its patched replacement when no patch is active yet.
 */
function patchMethod<T extends object, K extends keyof T>(
  owner: PatchOwner,
  target: T,
  method: K,
  factory: (original: T[K]) => T[K]
): void {
  if (typeof target[method] !== 'function') return;
  const patches =
    methodPatches.get(target) ?? new Map<PropertyKey, MethodPatch>();
  methodPatches.set(target, patches);
  const existing = patches.get(method);
  if (existing) {
    existing.owners.add(owner);
    return;
  }
  const owners = new Set([owner]);
  const original = target[method];
  const patch: MethodPatch = {
    owners,
    restore: () => {
      if (owners.size !== 0 || target[method] !== wrapped) return;
      target[method] = original;
      if (patches.get(method) === patch) patches.delete(method);
      if (patches.size === 0) methodPatches.delete(target);
    },
  };
  const wrapped = factory(original);
  target[method] = wrapped;
  patches.set(method, patch);
}

/**
 * Finds the most recently registered enabled owner for `(target, method)` via
 * a live `methodPatches` lookup so lazy `Run` closures do not pin stale
 * `owners` sets or instrumentation instances across `disable()` / `enable()`
 * cycles.
 */
function resolveActiveOwner(
  target: object,
  method: PropertyKey
): PatchOwner | undefined {
  const patch = methodPatches.get(target)?.get(method);
  if (!patch) return undefined;
  const owner = Array.from(patch.owners)
    .reverse()
    .find(instance => instance.isEnabled());
  if (!owner && patch.owners.size === 0) {
    patch.restore();
  }
  return owner;
}

/**
 * Creates a method wrapper that captures synchronous invocation failures and
 * wraps returned BeeAI `Run` instances for deferred async execution.
 *
 * Resolves the active owner dynamically via `(target, method)` rather than
 * closing over a single instance or `owners` set, so lazy `Run` instances
 * survive `disable()` / `enable()` cycles without pinning instrumentation
 * instances in memory.
 *
 * @template TMethod - Exact property signature (`T[K]`) of the prototype
 *   method being patched, preserving its parameter and return types across
 *   `patchMethod` without `strictFunctionTypes` contravariance mismatches.
 * @template TInvocation - GenAI telemetry invocation type
 *   (`LocalAgentInvocation`, `ToolInvocation`, `InferenceInvocation`, or
 *   `EmbeddingInvocation`) managed by `spec` for this operation.
 */
function createRunMethodWrapper<TMethod, TInvocation extends AnyInvocation>(
  target: object,
  method: PropertyKey,
  spec: RunOperationSpec<TInvocation>
): (original: TMethod) => TMethod {
  return (original: TMethod): TMethod => {
    const originalFn = original as unknown as (...args: unknown[]) => unknown;
    return function patchedBeeAIMethod(this: unknown, ...args: unknown[]) {
      const owner = resolveActiveOwner(target, method);
      const callerContext = context.active();
      if (!owner) {
        return originalFn.apply(this, args);
      }

      let returned: unknown;
      try {
        returned = originalFn.apply(this, args);
      } catch (error) {
        // We still wrap Runs under suppression so later re-runs trace, but skip sync errors here.
        if (!isTracingSuppressed(callerContext)) {
          recordSyncFailure(owner, this, args[0], callerContext, error, spec);
        }
        throw error;
      }

      if (isBeeAIRun(returned) && !wrappedRuns.has(returned)) {
        wrappedRuns.add(returned);
        wrapRunInstance(
          returned,
          this,
          args[0],
          callerContext,
          target,
          method,
          spec
        );
      }
      return returned;
    } as unknown as TMethod;
  };
}

/**
 * Records a failed invocation span and error metric when a patched method
 * throws synchronously before returning a `Run`.
 */
function recordSyncFailure<TInvocation extends AnyInvocation>(
  owner: PatchOwner,
  instance: unknown,
  inputArg: unknown,
  callerContext: Context,
  error: unknown,
  spec: RunOperationSpec<TInvocation>
): void {
  try {
    const handler = owner.getTelemetryHandler();
    const invocation = spec.startSyncInvocation(
      handler,
      instance,
      inputArg,
      callerContext
    );
    if (!invocation) {
      return;
    }
    invocation.fail({
      exception: error instanceof Error ? error : undefined,
    });
  } catch (err) {
    owner
      .getDiag()
      .warn(`BeeAI: could not record synchronous ${spec.label} error`, err);
  }
}

/**
 * Wraps `run.handler` so each execution of a lazy BeeAI `Run` creates its own
 * telemetry span, propagates context, and cleans up on settlement, resolving
 * the active owner dynamically via `(target, method)` at execution time.
 */
function wrapRunInstance<TInvocation extends AnyInvocation>(
  run: BeeAIRunLike,
  instance: unknown,
  inputArg: unknown,
  callerContext: Context,
  target: object,
  method: PropertyKey,
  spec: RunOperationSpec<TInvocation>
): void {
  const originalHandler = run.handler;
  // Creation-time callerContext bridges the single-tick gap in patterns like
  // `await context.with(ctx, () => runFactory())`, where `context.with()` pops
  // before `await` runs the lazy `Run`. Consume it at most once so re-awaiting
  // the cold `Run` uses the live execution context and drops references to
  // ended spans/contexts for GC.
  let pendingCallerContext: Context | undefined = callerContext;
  const executeWrappedRun = async () => {
    const owner = resolveActiveOwner(target, method);
    const executionContext = context.active();
    const consumedCallerContext = pendingCallerContext;
    pendingCallerContext = undefined;

    if (!owner || isTracingSuppressed(executionContext)) {
      return originalHandler.call(run);
    }

    const activeCallerContext = resolveActiveCallerContext(
      consumedCallerContext,
      executionContext
    );
    if (isTracingSuppressed(activeCallerContext)) {
      return context.with(suppressTracing(executionContext), () =>
        originalHandler.call(run)
      );
    }

    const runContext = run.runContext;
    const runId = runContext?.runId;
    const parentId = runContext?.parentId;
    const parentRun = parentId ? activeRuns.get(parentId) : undefined;
    const enclosingAgent = findEnclosingAgentRun(
      parentId,
      activeCallerContext,
      executionContext
    );
    const parentContext = resolveParentContext(
      activeCallerContext,
      executionContext,
      parentRun
    );
    const runParams = runContext?.runParams;
    const effectiveInput =
      Array.isArray(runParams) && runParams.length > 0
        ? runParams[0]
        : inputArg;

    let started: StartedRunOperation<TInvocation> | undefined;
    try {
      const handler = owner.getTelemetryHandler();
      started = spec.startRun({
        handler,
        instance,
        effectiveInput,
        parentContext,
        callerContext: activeCallerContext,
        runId,
        parentId,
        parentRun,
        runContext,
        enclosingAgent,
      });
      if (runId && started?.activeRun) {
        activeRuns.set(runId, started.activeRun);
      }
    } catch (err) {
      owner
        .getDiag()
        .warn(`BeeAI: could not start ${spec.label} telemetry`, err);
    }

    if (!started) {
      // Propagate the resolved parent context so delegated downstream
      // instrumentations (e.g. @opentelemetry/instrumentation-langchain)
      // still parent their spans under any enclosing BeeAI agent/caller span,
      // while isolating tool / remote-agent passthrough scopes so internal
      // calls inside them do not roll up onto an outer BeeAI agent.
      const passthroughContext = spec.isolatesAgentScope
        ? parentContext.setValue(ACTIVE_AGENT_CONTEXT_KEY, null)
        : enclosingAgent
          ? parentContext.setValue(ACTIVE_AGENT_CONTEXT_KEY, enclosingAgent)
          : parentContext;
      return context.with(passthroughContext, () => originalHandler.call(run));
    }

    const { invocation, activeRun, onSuccess, onFailure } = started;
    const runScopeContext =
      activeRun?.kind === 'agent'
        ? invocation.getContext().setValue(ACTIVE_AGENT_CONTEXT_KEY, activeRun)
        : activeRun?.kind === 'tool'
          ? invocation.getContext().setValue(ACTIVE_AGENT_CONTEXT_KEY, null)
          : enclosingAgent
            ? invocation
                .getContext()
                .setValue(ACTIVE_AGENT_CONTEXT_KEY, enclosingAgent)
            : invocation.getContext();
    try {
      const result = await context.with(runScopeContext, () =>
        originalHandler.call(run)
      );
      try {
        onSuccess?.(result);
      } catch (err) {
        owner
          .getDiag()
          .warn(`BeeAI: could not finalize ${spec.label} telemetry`, err);
      }
      invocation.stop();
      return result;
    } catch (error) {
      onFailure?.();
      invocation.fail({
        exception: error instanceof Error ? error : undefined,
      });
      throw error;
    } finally {
      started.cleanup?.();
      if (runId && activeRuns.get(runId) === activeRun) {
        activeRuns.delete(runId);
      }
    }
  };

  // BeeAI's `Run` extends `LazyPromise`, which is cold and re-executable:
  // every `.then()`, `.catch()`, `.finally()`, or `await` drains queued
  // `.context()` / `.observe()` / `.middleware()` tasks via `before()` and
  // invokes `this.handler()` fresh. Do not memoize the promise here, as
  // caching would suppress re-execution and drop late-bound tasks.
  run.handler = () => executeWrappedRun();
}

/**
 * Checks whether a value is a lazy BeeAI `Run` object exposing a `handler`
 * function.
 */
function isBeeAIRun(value: unknown): value is BeeAIRunLike {
  return isRecord(value) && typeof value.handler === 'function';
}
