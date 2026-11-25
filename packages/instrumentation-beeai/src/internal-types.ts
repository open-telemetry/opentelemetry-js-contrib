/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Context, DiagLogger, Span } from '@opentelemetry/api';
import type {
  EmbeddingInvocation,
  InferenceInvocation,
  LocalAgentInvocation,
  TelemetryHandler,
  ToolInvocation,
} from '@opentelemetry/genai-util';

/**
 * Union of all `@opentelemetry/genai-util` invocation handles created and
 * managed by `BeeAIInstrumentation`.
 */
export type AnyInvocation =
  | LocalAgentInvocation
  | ToolInvocation
  | InferenceInvocation
  | EmbeddingInvocation;

/**
 * Internal handle representing a `BeeAIInstrumentation` instance inside the
 * shared prototype patch registry without leaking private methods onto the
 * public class surface or creating circular module imports.
 */
export interface PatchOwner {
  /**
   * Returns whether this instrumentation instance is currently enabled.
   */
  isEnabled: () => boolean;

  /**
   * Returns the lazily initialized `@opentelemetry/genai-util`
   * {@link TelemetryHandler} for this instrumentation instance.
   */
  getTelemetryHandler: () => TelemetryHandler;

  /**
   * Returns the diagnostic logger attached to this instrumentation instance.
   */
  getDiag: () => DiagLogger;
}

/**
 * Tracks a single wrapped prototype method in the shared patch registry so
 * multiple `BeeAIInstrumentation` instances can instrument the same
 * `(target, method)` pair without double-wrapping.
 */
export interface MethodPatch {
  /**
   * Instrumentation instances currently holding an active patch registration on
   * this method, maintained in registration order so the most recently
   * registered enabled instance owns incoming calls.
   */
  owners: Set<PatchOwner>;

  /**
   * Restores the original unpatched method on the target prototype and deletes
   * its tracking entry once {@link owners} is empty and the prototype still
   * points to this patch's wrapper.
   */
  restore: () => void;
}

/**
 * Tracking entry stored in the in-flight run registry (`activeRuns`) while a
 * BeeAI `Run` is executing, enabling parent-child span correlation and agent
 * scope isolation.
 */
export interface BaseActiveRun {
  /**
   * Category of the instrumented BeeAI operation, used to recognize agent and
   * tool scope boundaries when walking the parent chain.
   */
  kind: 'agent' | 'tool' | 'inference' | 'embedding';

  /**
   * Unique BeeAI run identifier assigned by `RunContext` for this execution.
   */
  runId: string;

  /**
   * Identifier of the enclosing BeeAI parent `Run` from `runContext.parentId`,
   * when this execution was started inside another `Run`.
   */
  parentId?: string;

  /**
   * Active `@opentelemetry/genai-util` telemetry invocation owning the span and
   * metrics for this run.
   */
  invocation: AnyInvocation;

  /**
   * OpenTelemetry `Span` that was active at the call site when the `Run` was
   * constructed (`callerContext`), if any. Used to distinguish external caller
   * spans from spans owned by ancestor `Run` records during parent resolution.
   */
  callerSpan?: Span;
}

/**
 * Extended tracking record for an in-flight `BaseAgent` execution, storing
 * agent-level metadata and mutable token usage counters aggregated from direct
 * child `ChatModel` calls.
 */
export interface ActiveAgentRun extends BaseActiveRun {
  /**
   * Discriminator identifying this run record as a `BaseAgent` execution.
   */
  kind: 'agent';

  /**
   * Active {@link LocalAgentInvocation} handle used to record direct child
   * inference and tool call counts and to attach rolled-up token usage when the
   * agent completes or fails.
   */
  invocation: LocalAgentInvocation;

  /**
   * Resolved display name of the agent (from `meta.name`, `instance.name`, or
   * constructor name), propagated onto direct child tool invocations.
   */
  agentName?: string;

  /**
   * Configured `ChatModel` instance referenced by `agent.input.llm`, if set.
   * When present, only inference calls made against this exact instance roll up
   * into the agent's call count and token totals.
   */
  llm?: unknown;

  /**
   * Cumulative input token count rolled up from direct child `ChatModel`
   * invocations during this agent run; remains `undefined` until a child
   * reports an input token count.
   */
  inputTokens?: number;

  /**
   * Cumulative output token count rolled up from direct child `ChatModel`
   * invocations during this agent run; remains `undefined` until a child
   * reports an output token count.
   */
  outputTokens?: number;
}

/**
 * Tracking record stored in `activeRuns` for any in-flight BeeAI `Run`:
 * either a generic {@link BaseActiveRun} (`tool`, `inference`, or `embedding`)
 * or an {@link ActiveAgentRun}.
 */
export type ActiveRun = BaseActiveRun | ActiveAgentRun;

/**
 * Minimal structural view of a lazy BeeAI `Run` (`LazyPromise`) returned by
 * patched prototype methods (`run`, `create`, and `createStructure`).
 *
 * @template R - Value type produced when the `Run` resolves.
 */
export interface BeeAIRunLike<R = unknown> extends Promise<R> {
  /**
   * Deferred execution function invoked by BeeAI's `LazyPromise` each time the
   * `Run` is awaited. Wrapped by instrumentation to manage telemetry across
   * fresh executions without memoizing the returned promise.
   *
   * @returns Promise resolving to the execution result of type `R`.
   */
  handler: () => Promise<R>;

  /**
   * Optional BeeAI `RunContext` metadata attached to the `Run`, exposing run
   * identifiers, late-bound input parameters, custom context data, and an event
   * emitter for lifecycle observation.
   */
  runContext?: {
    /**
     * Unique identifier generated by BeeAI for this `Run` execution.
     */
    runId?: string;

    /**
     * Identifier of the parent `Run` that initiated this execution, if nested.
     */
    parentId?: string;

    /**
     * Optional identifier grouping related runs within a BeeAI workflow.
     */
    groupId?: string;

    /**
     * Arbitrary key-value metadata attached via `.context(...)` (for example,
     * `toolCallMsg` containing `toolCallId` for tool runs).
     */
    context?: Record<string, unknown>;

    /**
     * Argument tuple captured by BeeAI's `RunContext`. When present and
     * non-empty, element `0` reflects the effective input after any `.middleware`
     * or context modifications.
     */
    runParams?: unknown;

    /**
     * BeeAI component instance bound to the `RunContext`.
     */
    instance?: unknown;

    /**
     * Event emitter scoped to this `Run`, used to listen for lifecycle events
     * such as `newToken` (streaming chunks) and `success` (final agent reply).
     */
    emitter?: {
      /**
       * Subscribes to a specific named emitter event.
       *
       * @param event - Exact event name to subscribe to (e.g., `'newToken'`).
       * @param callback - Listener invoked with the emitted payload (`data`)
       *   and BeeAI event metadata (`meta`).
       * @returns Optional unsubscribe function to remove the listener on cleanup.
       */
      on?: (
        event: string,
        callback: (data: unknown, meta: unknown) => void
      ) => (() => void) | void;

      /**
       * Subscribes to emitter events matching a name or predicate function.
       *
       * @param matcher - Exact event name string or predicate receiving an
       *   event descriptor object (`{ name?: string }`) and returning `true` to
       *   dispatch to `callback`.
       * @param callback - Listener invoked with the emitted payload (`data`)
       *   and BeeAI event metadata (`meta`).
       * @returns Optional unsubscribe function to remove the listener on cleanup.
       */
      match?: (
        matcher: string | ((event: { name?: string }) => boolean),
        callback: (data: unknown, meta: unknown) => void
      ) => (() => void) | void;
    };
  };
}

/**
 * Resolved arguments passed to {@link RunOperationSpec.startRun} when a wrapped
 * BeeAI `Run` begins executing.
 */
export interface RunStartParams {
  /**
   * Lazily initialized `@opentelemetry/genai-util` {@link TelemetryHandler}
   * used to start spans and record metrics.
   */
  handler: TelemetryHandler;

  /**
   * Receiver object (`this`) on which the patched method was invoked (e.g., a
   * `BaseAgent`, `Tool`, `ChatModel`, or `EmbeddingModel` instance).
   */
  instance: unknown;

  /**
   * Primary input argument for this run: `runContext.runParams[0]` when
   * available, otherwise the original first argument passed to the method.
   */
  effectiveInput: unknown;

  /**
   * Resolved OpenTelemetry parent {@link Context} under which the new
   * invocation span should be created.
   */
  parentContext: Context;

  /**
   * Active OpenTelemetry {@link Context} associated with the caller: the
   * creation-time context on initial execution while its span is live in the
   * same trace, otherwise the execution-time context.
   */
  callerContext: Context;

  /**
   * Unique BeeAI run identifier from `runContext?.runId`, if available.
   */
  runId: string | undefined;

  /**
   * Parent BeeAI run identifier from `runContext?.parentId`, if this `Run` is
   * nested under another run.
   */
  parentId: string | undefined;

  /**
   * In-flight tracking record looked up for {@link parentId} in `activeRuns`,
   * if a matching parent run is currently executing.
   */
  parentRun: ActiveRun | undefined;

  /**
   * BeeAI `RunContext` attached to the executing {@link BeeAIRunLike}, if any.
   */
  runContext: BeeAIRunLike['runContext'];

  /**
   * Nearest enclosing {@link ActiveAgentRun} resolved by walking `activeRuns`
   * and OpenTelemetry contexts, stopping at tool or remote-agent boundaries so
   * tool-internal calls are not attributed to an outer agent.
   */
  enclosingAgent: ActiveAgentRun | undefined;
}

/**
 * Lifecycle handle returned by {@link RunOperationSpec.startRun} for a single
 * started BeeAI `Run` execution.
 *
 * @template TInvocation - Concrete `@opentelemetry/genai-util` invocation type
 *   started for the operation.
 */
export interface StartedRunOperation<TInvocation extends AnyInvocation> {
  /**
   * Started telemetry invocation whose OpenTelemetry context becomes active
   * while `originalHandler` executes, and which is stopped on success or failed
   * on rejection.
   */
  invocation: TInvocation;

  /**
   * Optional tracking entry to register in `activeRuns` under `runId` while
   * this execution is in flight (removed automatically on settlement).
   */
  activeRun?: ActiveRun;

  /**
   * Optional teardown hook always executed in the `finally` block after
   * settlement (e.g., to unsubscribe BeeAI emitter listeners).
   */
  cleanup?: () => void;

  /**
   * Optional callback executed when the `Run` resolves and before
   * `invocation.stop()`, allowing response metadata, usage, finish reasons, and
   * output content to be recorded.
   *
   * @param result - Resolved return value produced by `originalHandler`.
   */
  onSuccess?: (result: unknown) => void;

  /**
   * Optional callback executed when the `Run` rejects and before
   * `invocation.fail(...)` (e.g., to flush accumulated token usage onto a
   * failed agent span).
   */
  onFailure?: () => void;
}

/**
 * Declarative lifecycle specification supplied to `patchRunMethod` defining
 * how an instrumented BeeAI operation (`agent`, `tool`, `chat model`, or
 * `embedding`) creates, scopes, and finalizes its telemetry.
 *
 * @template TInvocation - Concrete `@opentelemetry/genai-util` invocation type
 *   managed by this specification.
 */
export interface RunOperationSpec<TInvocation extends AnyInvocation> {
  /**
   * Human-readable operation label included in diagnostic warning logs (e.g.,
   * `'agent'`, `'tool'`, `'chat model'`, or `'embedding'`).
   */
  label: string;

  /**
   * When `true` and {@link startRun} returns `undefined` (passthrough execution
   * such as `RemoteAgent` or a delegated `LangChainTool`), sets the active
   * agent context key to `null` inside the propagated context so nested calls
   * cannot roll up onto an outer BeeAI agent.
   */
  isolatesAgentScope?: boolean;

  /**
   * Starts a minimal invocation when the patched prototype method throws
   * synchronously before returning a `Run`, so the synchronous error can be
   * recorded immediately.
   *
   * @param handler - {@link TelemetryHandler} used to construct the invocation.
   * @param instance - Receiver (`this`) on which the patched method threw.
   * @param inputArg - First argument (`args[0]`) passed to the patched method.
   * @param callerContext - OpenTelemetry {@link Context} active at the call site.
   * @returns Started invocation to immediately fail, or `undefined` to skip
   *   telemetry (for example, on delegated adapters or `RemoteAgent`).
   */
  startSyncInvocation: (
    handler: TelemetryHandler,
    instance: unknown,
    inputArg: unknown,
    callerContext: Context
  ) => TInvocation | undefined;

  /**
   * Starts telemetry for an executing lazy `Run` and returns the corresponding
   * lifecycle hooks.
   *
   * @param params - Resolved execution context, BeeAI run metadata, and
   *   instrumentation handles for the starting run.
   * @returns Lifecycle handle containing the started invocation and optional
   *   callbacks, or `undefined` to pass the call through without emitting a
   *   BeeAI span (e.g., for internal `final_answer` tools, `RemoteAgent`, or
   *   LangChain wrapper adapters).
   */
  startRun: (
    params: RunStartParams
  ) => StartedRunOperation<TInvocation> | undefined;
}
