import type { Span } from '@opentelemetry/api';
import type { UserInteractionAggregates, UserInteractionEvents } from './types';

type OnCompleteCallback = (
  attributes: UserInteractionAggregates,
  events: UserInteractionEvents
) => void;
type OnErrorCallback = (error: Error) => void;

export class UserInteractionZoneSpec implements ZoneSpec {
  name = 'UserInteractionZone';
  properties: { span: Span };

  // interaction state
  private completed = false;
  private count = 0;
  private unresolvedCount = 0;

  // interaction metrics
  //// span attributes
  private attributes: UserInteractionAggregates = {
    listenerCount: 0,
    scheduledTaskCount: 0,
    cancelledTaskCount: 0,
    ranTaskCount: 0,
  };

  //// span events
  private events: UserInteractionEvents = {
    processingStart: 0, // the time when the browser is able to begin processing event handlers
    processingEnd: 0, // the time when the browser finishes exeucting all sync code initiated from event handlers
  };

  constructor(
    span: Span,
    onComplete: OnCompleteCallback,
    onError: OnErrorCallback
  ) {
    this.properties = { span };
    this.onComplete = onComplete;
    this.onError = onError;
  }

  /**
   * Callback passed into UserInteractionZun.run(), and will be inherited by child zones
   * in terms of this instrumentation, that is when an event listener callback fires.
   *
   * Intercepts when a new zone is entered.
   */
  onInvoke(
    parentZoneDelegate: ZoneDelegate,
    current: Zone,
    target: Zone,
    delegate: Function,
    applyThis: any,
    applyArgs?: any[],
    source?: string
  ) {
    // current === target is true only when intercepting "root" UserInteractionZone
    if (current === target) {
      try {
        // this.printDebugInfo('root::onInvoke');
        this.attributes.listenerCount++;
        // if executing in the UserInteractionZone, capture earliest processingStart for sync work timing
        if (!this.events.processingStart)
          this.events.processingStart = performance.now();
        return parentZoneDelegate.invoke(
          target,
          delegate,
          applyThis,
          applyArgs
        );
      } finally {
        // continually update processingEnd (in case of multiple listeners) with latest timestamp to record end of sync work
        this.events.processingEnd = performance.now();
      }
    }

    // if a child zone is invoking a Promise.then callback and there are pending unresolved promises, decrease unresolvedCount
    // TODO: compare by reference rather than naively assuming the promises resolve
    const task = Zone.currentTask;
    if (
      task?.source === 'Promise.then' &&
      task?.state === 'running' &&
      this.unresolvedCount > 0
    ) {
      this.unresolvedCount--;
    }

    const ret = parentZoneDelegate.invoke(
      target,
      delegate,
      applyThis,
      applyArgs
    );

    // Increase unresolvedCount if any child zone.run() callback returns a Promise ("thenable").
    // This is necessary to capture unresolved promise chains within event listeners,
    // since the next macro task will be scheduled once all sync work is complete.
    // This enables capture of async work that occurs within event handlers, such as data fetches or timers.
    if (ret && ret.then) this.unresolvedCount++;
    return ret;
  }

  // setTimeout
  onScheduleTask(
    delegate: ZoneDelegate,
    current: Zone,
    target: Zone,
    task: Task
  ) {
    if (task.type === 'eventTask' || task.data?.isPeriodic || this.completed) {
      return delegate.scheduleTask(target, task);
    }

    this.count++;
    this.attributes.scheduledTaskCount++;
    return delegate.scheduleTask(target, task);
  }

  // clearTimeout, when setTimeout finishes
  onInvokeTask(
    delegate: ZoneDelegate,
    current: Zone,
    target: Zone,
    task: Task,
    applyThis: any,
    applyArgs: any
  ) {
    if (task.type === 'eventTask' || task.data?.isPeriodic || this.completed) {
      return delegate.invokeTask(target, task, applyThis, applyArgs);
    }

    this.count--;
    this.attributes.ranTaskCount++;
    return delegate.invokeTask(target, task, applyThis, applyArgs);
  }

  onCancelTask(
    delegate: ZoneDelegate,
    current: Zone,
    target: Zone,
    task: Task
  ) {
    this.attributes.cancelledTaskCount++;
    console.log('onCancelTask', this.count, this.unresolvedCount);
    return delegate.cancelTask(target, task);
  }

  onHasTask(
    delegate: ZoneDelegate,
    current: Zone,
    target: Zone,
    hasTaskState: HasTaskState
  ) {
    delegate.hasTask(target, hasTaskState);

    // skip onHasTask for child zones to prevent double checking
    if (current !== target) {
      return;
    }

    if (this.count === 0 && this.unresolvedCount === 0 && !this.completed) {
      target.run(() => {
        this.completed = true;
        this.onComplete(this.attributes, this.events);
      });
    }
  }

  onHandleError(
    delegate: ZoneDelegate,
    current: Zone,
    target: Zone,
    error: any
  ) {
    target.run(() => this.onError(error));
    return delegate.handleError(target, error);
  }
  // hook for when interaction completes
  public onComplete(_attributes: any, _events: any) {}

  // hook for when error occurs during interaction
  public onError(_error: Error) {}
}
