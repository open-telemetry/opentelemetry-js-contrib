/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  isWrapped,
  InstrumentationBase,
  InstrumentationConfig,
} from '@opentelemetry/instrumentation';

import * as api from '@opentelemetry/api';
import { getSpan, Span } from '@opentelemetry/api';
import { hrTime } from '@opentelemetry/core';
import { getElementXPath } from '@opentelemetry/web';
import { AttributeNames } from './enums/AttributeNames';
import {
  AsyncTask,
  RunTaskFunction,
  SpanData,
  WindowWithZone,
  ZoneTypeWithPrototype,
} from './types';
import { VERSION } from './version';

const ZONE_CONTEXT_KEY = 'OT_ZONE_CONTEXT';
const EVENT_NAVIGATION_NAME = 'Navigation:';

/**
 * This class represents a UserInteraction plugin for auto instrumentation.
 * If zone.js is available then it patches the zone otherwise it patches
 * addEventListener of HTMLElement
 */
export class UserInteractionInstrumentation extends InstrumentationBase<unknown> {
  readonly component: string = 'user-interaction';
  readonly version = VERSION;
  moduleName = this.component;
  private _spansData = new WeakMap<api.Span, SpanData>();
  private _zonePatched = false;
  // for addEventListener/removeEventListener state
  private _wrappedListeners = new WeakMap<
    Function | EventListenerObject,
    Map<string, Map<HTMLElement, Function>>
  >();
  // for event bubbling
  private _eventsSpanMap: WeakMap<Event, Span> = new WeakMap<Event, Span>();

  constructor(config?: InstrumentationConfig) {
    super('@opentelemetry/instrumentation-user-interaction', VERSION, config);
  }

  init() {}

  /**
   * This will check if last task was timeout and will save the time to
   * fix the user interaction when nothing happens
   * This timeout comes from xhr plugin which is needed to collect information
   * about last xhr main request from observer
   * @param task
   * @param span
   */
  private _checkForTimeout(task: AsyncTask, span: api.Span) {
    const spanData = this._spansData.get(span);
    if (spanData) {
      if (task.source === 'setTimeout') {
        spanData.hrTimeLastTimeout = hrTime();
      } else if (
        task.source !== 'Promise.then' &&
        task.source !== 'setTimeout'
      ) {
        spanData.hrTimeLastTimeout = undefined;
      }
    }
  }

  /**
   * Controls whether or not to create a span, based on the event type.
   */
  protected _allowEventType(eventType: string): boolean {
    return eventType === 'click';
  }
  /**
   * Creates a new span
   * @param element
   * @param eventName
   */
  private _createSpan(
    element: HTMLElement,
    eventName: string,
    parentSpan?: Span | undefined
  ): api.Span | undefined {
    if (!element.getAttribute) {
      return undefined;
    }
    if (element.hasAttribute('disabled')) {
      return undefined;
    }
    if (!this._allowEventType(eventName)) {
      return undefined;
    }
    const xpath = getElementXPath(element, true);
    try {
      const span = this.tracer.startSpan(
        eventName,
        {
          attributes: {
            [AttributeNames.COMPONENT]: this.component,
            [AttributeNames.EVENT_TYPE]: eventName,
            [AttributeNames.TARGET_ELEMENT]: element.tagName,
            [AttributeNames.TARGET_XPATH]: xpath,
            [AttributeNames.HTTP_URL]: window.location.href,
            [AttributeNames.HTTP_USER_AGENT]: navigator.userAgent,
          },
        },
        parentSpan ? api.setSpan(api.context.active(), parentSpan) : undefined
      );

      this._spansData.set(span, {
        taskCount: 0,
      });

      return span;
    } catch (e) {
      this._logger.error(this.component, e);
    }
    return undefined;
  }

  /**
   * Decrement number of tasks that left in zone,
   * This is needed to be able to end span when no more tasks left
   * @param span
   */
  private _decrementTask(span: api.Span) {
    const spanData = this._spansData.get(span);
    if (spanData) {
      spanData.taskCount--;
      if (spanData.taskCount === 0) {
        this._tryToEndSpan(span, spanData.hrTimeLastTimeout);
      }
    }
  }

  /**
   * Return the current span
   * @param zone
   * @private
   */
  private _getCurrentSpan(zone: Zone): api.Span | undefined {
    const context: api.Context | undefined = zone.get(ZONE_CONTEXT_KEY);
    if (context) {
      return getSpan(context);
    }
    return context;
  }

  /**
   * Increment number of tasks that are run within the same zone.
   *     This is needed to be able to end span when no more tasks left
   * @param span
   */
  private _incrementTask(span: api.Span) {
    const spanData = this._spansData.get(span);
    if (spanData) {
      spanData.taskCount++;
    }
  }

  /**
   * Returns true iff we should use the patched callback; false if it's already been patched
   */
  private addPatchedListener(
    on: HTMLElement,
    type: string,
    listener: Function | EventListenerObject,
    wrappedListener: Function
  ): boolean {
    let listener2Type = this._wrappedListeners.get(listener);
    if (!listener2Type) {
      listener2Type = new Map();
      this._wrappedListeners.set(listener, listener2Type);
    }
    let element2patched = listener2Type.get(type);
    if (!element2patched) {
      element2patched = new Map();
      listener2Type.set(type, element2patched);
    }
    if (element2patched.has(on)) {
      return false;
    }
    element2patched.set(on, wrappedListener);
    return true;
  }

  /**
   * Returns the patched version of the callback (or undefined)
   */
  private removePatchedListener(
    on: HTMLElement,
    type: string,
    listener: Function | EventListenerObject
  ): Function | undefined {
    const listener2Type = this._wrappedListeners.get(listener);
    if (!listener2Type) {
      return undefined;
    }
    const element2patched = listener2Type.get(type);
    if (!element2patched) {
      return undefined;
    }
    const patched = element2patched.get(on);
    if (patched) {
      element2patched.delete(on);
      if (element2patched.size === 0) {
        listener2Type.delete(type);
        if (listener2Type.size === 0) {
          this._wrappedListeners.delete(listener);
        }
      }
    }
    return patched;
  }

  // utility method to deal with the Function|EventListener nature of addEventListener
  private _invokeListener(
    listener: Function | EventListenerObject,
    target: any,
    args: any[]
  ): any {
    if (typeof listener === 'function') {
      return listener.apply(target, args);
    } else {
      return listener.handleEvent(args[0]);
    }
  }

  /**
   * This patches the addEventListener of HTMLElement to be able to
   * auto instrument the click events
   * This is done when zone is not available
   */
  private _patchElement() {
    const plugin = this;
    return (original: Function) => {
      return function addEventListenerPatched(
        this: HTMLElement,
        type: any,
        listener: any,
        useCapture: any
      ) {
        const once = useCapture && useCapture.once;
        const patchedListener = (...args: any[]) => {
          const target = this;
          let parentSpan: Span | undefined;
          const event: Event | undefined = args[0];
          if (event) {
            parentSpan = plugin._eventsSpanMap.get(event);
          }
          if (once) {
            plugin.removePatchedListener(this, type, listener);
          }
          const span = plugin._createSpan(target, type, parentSpan);
          if (span) {
            if (event) {
              plugin._eventsSpanMap.set(event, span);
            }
            return api.context.with(
              api.setSpan(api.context.active(), span),
              () => {
                const result = plugin._invokeListener(listener, target, args);
                // no zone so end span immediately
                span.end();
                return result;
              }
            );
          } else {
            return plugin._invokeListener(listener, target, args);
          }
        };
        if (plugin.addPatchedListener(this, type, listener, patchedListener)) {
          return original.call(this, type, patchedListener, useCapture);
        }
      };
    };
  }

  /**
   * This patches the removeEventListener of HTMLElement to handle the fact that
   * we patched the original callbacks
   * This is done when zone is not available
   */
  private _patchRemoveEventListener() {
    const plugin = this;
    return (original: Function) => {
      return function removeEventListenerPatched(
        this: HTMLElement,
        type: any,
        listener: any,
        useCapture: any
      ) {
        const wrappedListener = plugin.removePatchedListener(
          this,
          type,
          listener
        );
        if (wrappedListener) {
          return original.call(this, type, wrappedListener, useCapture);
        } else {
          return original.call(this, type, listener, useCapture);
        }
      };
    };
  }

  /**
   * Patches the history api
   */
  _patchHistoryApi() {
    this._unpatchHistoryApi();

    this._wrap(history, 'replaceState', this._patchHistoryMethod());
    this._wrap(history, 'pushState', this._patchHistoryMethod());
    this._wrap(history, 'back', this._patchHistoryMethod());
    this._wrap(history, 'forward', this._patchHistoryMethod());
    this._wrap(history, 'go', this._patchHistoryMethod());
  }

  /**
   * Patches the certain history api method
   */
  _patchHistoryMethod() {
    const plugin = this;
    return (original: any) => {
      return function patchHistoryMethod(this: History, ...args: unknown[]) {
        const url = `${location.pathname}${location.hash}${location.search}`;
        const result = original.apply(this, args);
        const urlAfter = `${location.pathname}${location.hash}${location.search}`;
        if (url !== urlAfter) {
          plugin._updateInteractionName(urlAfter);
        }
        return result;
      };
    };
  }

  /**
   * unpatch the history api methods
   */
  _unpatchHistoryApi() {
    if (isWrapped(history.replaceState)) this._unwrap(history, 'replaceState');
    if (isWrapped(history.pushState)) this._unwrap(history, 'pushState');
    if (isWrapped(history.back)) this._unwrap(history, 'back');
    if (isWrapped(history.forward)) this._unwrap(history, 'forward');
    if (isWrapped(history.go)) this._unwrap(history, 'go');
  }

  /**
   * Updates interaction span name
   * @param url
   */
  _updateInteractionName(url: string) {
    const span: api.Span | undefined = api.getSpan(api.context.active());
    if (span && typeof span.updateName === 'function') {
      span.updateName(`${EVENT_NAVIGATION_NAME} ${url}`);
    }
  }

  /**
   * Patches zone cancel task - this is done to be able to correctly
   * decrement the number of remaining tasks
   */
  private _patchZoneCancelTask() {
    const plugin = this;
    return (original: any) => {
      return function patchCancelTask<T extends Task>(
        this: Zone,
        task: AsyncTask
      ) {
        const currentZone = Zone.current;
        const currentSpan = plugin._getCurrentSpan(currentZone);
        if (currentSpan && plugin._shouldCountTask(task, currentZone)) {
          plugin._decrementTask(currentSpan);
        }
        return original.call(this, task) as T;
      };
    };
  }

  /**
   * Patches zone schedule task - this is done to be able to correctly
   * increment the number of tasks running within current zone but also to
   * save time in case of timeout running from xhr plugin when waiting for
   * main request from PerformanceResourceTiming
   */
  private _patchZoneScheduleTask() {
    const plugin = this;
    return (original: any) => {
      return function patchScheduleTask<T extends Task>(
        this: Zone,
        task: AsyncTask
      ) {
        const currentZone = Zone.current;
        const currentSpan = plugin._getCurrentSpan(currentZone);
        if (currentSpan && plugin._shouldCountTask(task, currentZone)) {
          plugin._incrementTask(currentSpan);
          plugin._checkForTimeout(task, currentSpan);
        }
        return original.call(this, task) as T;
      };
    };
  }

  /**
   * Patches zone run task - this is done to be able to create a span when
   * user interaction starts
   * @private
   */
  private _patchZoneRunTask() {
    const plugin = this;
    return (original: RunTaskFunction): RunTaskFunction => {
      return function patchRunTask(
        this: Zone,
        task: AsyncTask,
        applyThis?: any,
        applyArgs?: any
      ): Zone {
        const target: HTMLElement | undefined = task.target;
        let span: api.Span | undefined;
        const activeZone = this;
        if (target) {
          span = plugin._createSpan(target, task.eventName);
          if (span) {
            plugin._incrementTask(span);
            return activeZone.run(() => {
              try {
                return api.context.with(
                  api.setSpan(api.context.active(), span!),
                  () => {
                    const currentZone = Zone.current;
                    task._zone = currentZone;
                    return original.call(
                      currentZone,
                      task,
                      applyThis,
                      applyArgs
                    );
                  }
                );
              } finally {
                plugin._decrementTask(span as api.Span);
              }
            });
          }
        } else {
          span = plugin._getCurrentSpan(activeZone);
        }

        try {
          return original.call(activeZone, task, applyThis, applyArgs);
        } finally {
          if (span && plugin._shouldCountTask(task, activeZone)) {
            plugin._decrementTask(span);
          }
        }
      };
    };
  }

  /**
   * Decides if task should be counted.
   * @param task
   * @param currentZone
   * @private
   */
  private _shouldCountTask(task: AsyncTask, currentZone: Zone): boolean {
    if (task._zone) {
      currentZone = task._zone;
    }
    if (!currentZone || !task.data || task.data.isPeriodic) {
      return false;
    }
    const currentSpan = this._getCurrentSpan(currentZone);
    if (!currentSpan) {
      return false;
    }
    if (!this._spansData.get(currentSpan)) {
      return false;
    }
    return task.type === 'macroTask' || task.type === 'microTask';
  }

  /**
   * Will try to end span when such span still exists.
   * @param span
   * @param endTime
   * @private
   */
  private _tryToEndSpan(span: api.Span, endTime?: api.HrTime) {
    if (span) {
      const spanData = this._spansData.get(span);
      if (spanData) {
        span.end(endTime);
        this._spansData.delete(span);
      }
    }
  }

  /**
   * implements enable function
   */
  enable() {
    const ZoneWithPrototype = this.getZoneWithPrototype();
    this._logger.debug(
      'applying patch to',
      this.moduleName,
      this.version,
      'zone:',
      !!ZoneWithPrototype
    );
    if (ZoneWithPrototype) {
      if (isWrapped(ZoneWithPrototype.prototype.runTask)) {
        this._unwrap(ZoneWithPrototype.prototype, 'runTask');
        this._logger.debug('removing previous patch from method runTask');
      }
      if (isWrapped(ZoneWithPrototype.prototype.scheduleTask)) {
        this._unwrap(ZoneWithPrototype.prototype, 'scheduleTask');
        this._logger.debug('removing previous patch from method scheduleTask');
      }
      if (isWrapped(ZoneWithPrototype.prototype.cancelTask)) {
        this._unwrap(ZoneWithPrototype.prototype, 'cancelTask');
        this._logger.debug('removing previous patch from method cancelTask');
      }

      this._zonePatched = true;
      this._wrap(
        ZoneWithPrototype.prototype,
        'runTask',
        this._patchZoneRunTask()
      );
      this._wrap(
        ZoneWithPrototype.prototype,
        'scheduleTask',
        this._patchZoneScheduleTask()
      );
      this._wrap(
        ZoneWithPrototype.prototype,
        'cancelTask',
        this._patchZoneCancelTask()
      );
    } else {
      this._zonePatched = false;
      if (isWrapped(HTMLElement.prototype.addEventListener)) {
        this._unwrap(HTMLElement.prototype, 'addEventListener');
        this._logger.debug(
          'removing previous patch from method addEventListener'
        );
      }
      if (isWrapped(HTMLElement.prototype.removeEventListener)) {
        this._unwrap(HTMLElement.prototype, 'removeEventListener');
        this._logger.debug(
          'removing previous patch from method removeEventListener'
        );
      }
      this._wrap(
        HTMLElement.prototype,
        'addEventListener',
        this._patchElement()
      );
      this._wrap(
        HTMLElement.prototype,
        'removeEventListener',
        this._patchRemoveEventListener()
      );
    }

    this._patchHistoryApi();
  }

  /**
   * implements unpatch function
   */
  disable() {
    const ZoneWithPrototype = this.getZoneWithPrototype();
    this._logger.debug(
      'removing patch from',
      this.moduleName,
      this.version,
      'zone:',
      !!ZoneWithPrototype
    );
    if (ZoneWithPrototype && this._zonePatched) {
      if (isWrapped(ZoneWithPrototype.prototype.runTask)) {
        this._unwrap(ZoneWithPrototype.prototype, 'runTask');
      }
      if (isWrapped(ZoneWithPrototype.prototype.scheduleTask)) {
        this._unwrap(ZoneWithPrototype.prototype, 'scheduleTask');
      }
      if (isWrapped(ZoneWithPrototype.prototype.cancelTask)) {
        this._unwrap(ZoneWithPrototype.prototype, 'cancelTask');
      }
    } else {
      if (isWrapped(HTMLElement.prototype.addEventListener)) {
        this._unwrap(HTMLElement.prototype, 'addEventListener');
      }
      if (isWrapped(HTMLElement.prototype.removeEventListener)) {
        this._unwrap(HTMLElement.prototype, 'removeEventListener');
      }
    }
    this._unpatchHistoryApi();
  }

  /**
   * returns Zone
   */
  getZoneWithPrototype(): ZoneTypeWithPrototype | undefined {
    const _window: WindowWithZone = (window as unknown) as WindowWithZone;
    return _window.Zone;
  }
}
