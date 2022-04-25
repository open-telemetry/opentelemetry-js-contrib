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

import { isWrapped, InstrumentationBase } from '@opentelemetry/instrumentation';

import * as api from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import { getElementXPath } from '@opentelemetry/sdk-trace-web';
import { UserInteractionZoneSpec } from './UserInteractionZoneSpec';
import { AttributeNames } from './enums/AttributeNames';
import { EventName, UserInteractionInstrumentationConfig } from './types';
import { VERSION } from './version';

const EVENT_NAVIGATION_NAME = 'Navigation:';
const DEFAULT_EVENT_NAMES: EventName[] = ['click'];

/**
 * This class represents a UserInteraction plugin for auto instrumentation.
 * If zone.js is available then it patches the zone otherwise it patches
 * addEventListener of HTMLElement
 */
export class UserInteractionInstrumentation extends InstrumentationBase<typeof window.addEventListener> {
  static readonly component: string = 'user-interaction';

  private _zonePatched?: boolean;
  private _eventNames: Set<EventName>;

  // for addEventListener/removeEventListener state
  private _wrappedListeners = new WeakMap<
    Function | EventListenerObject,
    Map<string, Map<HTMLElement, Function>>
  >();

  // stores reference to active Zone if in use, and the active Span otherwise
  private _activeInteractionContexts: WeakMap<Event, Zone | api.Span> =
    new WeakMap();

  constructor(config: UserInteractionInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-user-interaction', VERSION, { ...config });
    this._eventNames = new Set(config.eventNames ?? DEFAULT_EVENT_NAMES);
  }

  init() {}

  /**
   * Controls whether or not to create a span, based on the event type.
   */
  private _allowEventName(eventName: EventName): boolean {
    return this._eventNames.has(eventName);
  }

  // utility method to deal with the Function|EventListener nature of addEventListener
  private _invokeListener(
    listener: EventListener | EventListenerObject,
    target: EventTarget,
    event: Event
  ): any {
    if (typeof listener === 'function') {
      return listener.call(target, event);
    } else {
      return listener.handleEvent.call(target, event);
    }
  }

  /**
   * This patches the addEventListener of HTMLElement to be able to
   * auto instrument the click events
   */
  private _patchAddEventListener() {
    const plugin = this;
    return (original: EventTarget['addEventListener']) => {
      return function addEventListenerPatched(
        this: HTMLElement,
        type: keyof HTMLElementEventMap,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions
      ) {
        if (
          !listener ||
          !plugin._allowEventName(type) ||
          isTracingSuppressed(api.context.active())
        ) {
          return original.call(this, type, listener, options);
        }

        const element = this;
        const patchedListener = function (event: Event) {
          let span: api.Span;
          let activeInteractionContext =
            plugin._activeInteractionContexts.get(event);

          if (!activeInteractionContext) {
            // create active listener span
            span = plugin.tracer.startSpan(type, {
              startTime: event.timeStamp,
              attributes: {
                [AttributeNames.INSTRUMENTATION_NAME]: plugin.instrumentationName,
                [AttributeNames.INSTRUMENTATION_VERSION]: plugin.instrumentationVersion,
                [AttributeNames.EVENT_TYPE]: type,
                [AttributeNames.TARGET_ELEMENT]: element.tagName,
                [AttributeNames.TARGET_XPATH]: getElementXPath(element, true),
                [AttributeNames.HTTP_URL]: window.location.href,
                [AttributeNames.HTTP_USER_AGENT]: navigator.userAgent,
              },
            });

            if (plugin._zonePatched) {
              // create a new zone for listener for given target
              activeInteractionContext = Zone.current.fork(
                new UserInteractionZoneSpec(
                  span,
                  function onComplete(attributes, events) {
                    console.log('onComplete', event);
                    span.setAttributes({
                      [AttributeNames.LISTENERS_COUNT]: attributes.listenerCount,
                      [AttributeNames.TASKS_SCHEDULED_COUNT]: attributes.scheduledTaskCount,
                      [AttributeNames.TASKS_RAN_COUNT]: attributes.ranTaskCount,
                      [AttributeNames.TASKS_CANCELLED_COUNT]: attributes.cancelledTaskCount,
                    });
                    span.addEvent('processingStart', events.processingStart);
                    span.addEvent('processingEnd', events.processingEnd);
                    span.end();
                    plugin._activeInteractionContexts.delete(event);
                  },
                  function onError(error) {
                    span.recordException(error);
                    span.setStatus({
                      code: api.SpanStatusCode.ERROR,
                      message: error?.message ?? error,
                    });
                  }
                )
              );
            } else {
              // if not using zones, set span as activeInteractionContext
              activeInteractionContext = span;
            }

            plugin._activeInteractionContexts.set(
              event,
              activeInteractionContext
            );
          }

          if (plugin._zonePatched) {
            const activeInteractionZone = activeInteractionContext as Zone;
            const span = activeInteractionZone.get('span');
            return activeInteractionZone.runGuarded(() => {
              return api.context.with(
                api.trace.setSpan(api.context.active(), span),
                () => plugin._invokeListener(listener, element, event)
              );
            });
          } else {
            const span = activeInteractionContext as api.Span;
            return api.context.with(
              api.trace.setSpan(api.context.active(), span),
              () => {
                try {
                  return plugin._invokeListener(listener, element, event);
                } catch (error: unknown) {
                  if (error instanceof Error) {
                    span.recordException(error);
                    span.setStatus({
                      code: api.SpanStatusCode.ERROR,
                      message: error.message,
                    });
                  } else {
                    span.setStatus({
                      code: api.SpanStatusCode.ERROR,
                      message: error as any,
                    });
                  }
                  throw error;
                } finally {
                  // TODO: figure out how to end span for multiple event targets without Zone
                  span.end();
                }
              }
            );
          }
        };

        if (plugin._addPatchedListener(this, type, listener, patchedListener)) {
          return original.call(this, type, patchedListener, options);
        }
      };
    };
  }

  private _patchRemoveEventListener() {
    const plugin = this;
    return (original: Function) => {
      return function removeEventListenerPatched(
        this: HTMLElement,
        type: any,
        listener: any,
        options: boolean | AddEventListenerOptions
      ) {
        const wrappedListener = plugin._removePatchedListener(
          this,
          type,
          listener
        );
        if (wrappedListener) {
          return original.call(this, type, wrappedListener, options);
        } else {
          return original.call(this, type, listener, options);
        }
      };
    };
  }

  /**
   * Returns true iff we should use the patched callback; false if it's already been patched
   */
  private _addPatchedListener(
    element: HTMLElement,
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
    if (element2patched.has(element)) {
      return false;
    }
    element2patched.set(element, wrappedListener);
    return true;
  }

  /**
   * Returns the patched version of the callback (or undefined)
   */
  private _removePatchedListener(
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

  /**
   * Most browser provide event listener api via EventTarget in prototype chain.
   * Exception to this is IE 11 which has it on the prototypes closest to EventTarget:
   *
   * * - has addEventListener in IE
   * ** - has addEventListener in all other browsers
   * ! - missing in IE
   *
   * HTMLElement -> Element -> Node * -> EventTarget **! -> Object
   * Document -> Node * -> EventTarget **! -> Object
   * Window * -> WindowProperties ! -> EventTarget **! -> Object
   */
  private _getPatchableEventTargets(): EventTarget[] {
    return window.EventTarget
      ? [EventTarget.prototype]
      : [Node.prototype, Window.prototype];
  }

  /**
   * Updates interaction span name
   * @param url
   */
   _updateInteractionName(url: string) {
    const span: api.Span | undefined = api.trace.getSpan(api.context.active());
    if (span && typeof span.updateName === 'function') {
      span.updateName(`${EVENT_NAVIGATION_NAME} ${url}`);
    }
  }

  /**
   * Patches the history api
   */
  private _patchHistoryApi() {
    this._unpatchHistoryApi();

    const historyMethods: (keyof History)[] = ['replaceState', 'pushState', 'back', 'forward', 'go'];
    this._massWrap(
      historyMethods.map(() => history),
      historyMethods,
      this._patchHistoryMethod()
    );
  }

  /**
   * Patches the certain history api method
   */
  private _patchHistoryMethod() {
    const plugin = this;
    return (original: any) => {
      return function patchHistoryMethod(this: History, ...args: unknown[]) {
        const url = `${location.pathname}${location.hash}${location.search}`;
        const result = original.apply(this, args);
        const urlAfter = `${location.pathname}${location.hash}${location.search}`;
        if (url !== urlAfter) {
          // TODO: parameterize
          plugin._updateInteractionName(urlAfter);
        }
        return result;
      };
    };
  }

  /**
   * unpatch the history api methods
   */
   private _unpatchHistoryApi() {
    const historyMethods: (keyof History)[] = [
      'replaceState',
      'pushState',
      'back',
      'forward',
      'go',
    ];
    historyMethods.forEach((methodName) => {
      if (isWrapped(history[methodName])) {
        this._unwrap(history, methodName);
      }
    });
  }

  /**
   * implements enable function
   */
  override enable() {
    const targets = this._getPatchableEventTargets();
    this._zonePatched = !!(window as any).Zone;

    targets.forEach((target) => {
      if (isWrapped(target.addEventListener)) {
        this._unwrap(target, 'addEventListener');
        api.diag.debug('removing previous patch from method addEventListener');
      }

      if (isWrapped(target.removeEventListener)) {
        this._unwrap(target, 'removeEventListener');
        api.diag.debug(
          'removing previous patch from method removeEventListener'
        );
      }

      this._wrap(target, 'addEventListener', this._patchAddEventListener());
      this._wrap(
        target,
        'removeEventListener',
        this._patchRemoveEventListener()
      );
    });

    this._patchHistoryApi();
  }

  /**
   * implements unpatch function
   */
  override disable() {
    const targets = this._getPatchableEventTargets();
    targets.forEach((target) => {
      if (isWrapped(target.addEventListener)) {
        this._unwrap(target, 'addEventListener');
      }

      if (isWrapped(target.removeEventListener)) {
        this._unwrap(target, 'removeEventListener');
      }
    });

    this._unpatchHistoryApi();
  }
}
