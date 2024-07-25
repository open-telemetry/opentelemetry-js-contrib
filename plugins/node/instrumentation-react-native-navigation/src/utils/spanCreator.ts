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
import { AppStateStatus } from 'react-native';
import { MutableRefObject } from 'react';

import { TracerRef } from './hooks/useTracerRef';
import { SpanRef } from './hooks/useSpanRef';
import { Attributes } from '@opentelemetry/api';

const ATTRIBUTES = {
  initialView: 'view.launch',
  finalView: 'view.unmount',
  viewName: 'view.name',
  appState: 'view.state.end',
};

const spanStart = (
  tracer: TracerRef,
  span: SpanRef,
  currentRouteName: string,
  customAttributes?: Attributes,
  isLaunch?: boolean
) => {
  if (!tracer.current || span.current !== null) {
    // do nothing in case for some reason the tracer is not initialized or there is already an active span
    return;
  }

  // Starting the span
  span.current = tracer.current.startSpan(currentRouteName);

  // it should create the first span knowing there is not a previous view
  span.current.setAttribute(ATTRIBUTES.initialView, !!isLaunch);
  // it should set the view name in case it's useful have this as attr
  span.current.setAttribute(ATTRIBUTES.viewName, currentRouteName);

  if (customAttributes) {
    span.current.setAttributes(customAttributes);
  }
};

const spanEnd = (
  span: SpanRef,
  appState?: AppStateStatus,
  isUnmount?: boolean
) => {
  if (span.current) {
    span.current.setAttribute(ATTRIBUTES.appState, appState ?? 'active');

    if (isUnmount) {
      span.current.setAttribute(ATTRIBUTES.finalView, true);
    }

    span.current.end();

    // make sure we destroy any existent span
    span.current = null;
  }
};

const spanCreatorAppState =
  (tracer: TracerRef, span: SpanRef, customAttributes?: Attributes) =>
  (currentRouteName: string, currentState: AppStateStatus) => {
    if (currentState === null || currentState === undefined) {
      return;
    }

    if (currentState === 'active') {
      spanStart(tracer, span, currentRouteName, customAttributes);
    } else {
      spanEnd(span, currentState);
    }
  };

const spanCreator = (
  tracer: TracerRef,
  span: SpanRef,
  view: MutableRefObject<string | null>,
  currentRouteName: string,
  customAttributes?: Attributes
) => {
  if (!tracer.current) {
    // do nothing in case for some reason the tracer is not initialized
    return;
  }

  const isInitialView = view.current === null;

  const shouldEndCurrentSpan =
    view.current !== null && view.current !== currentRouteName;

  // it means the view has changed and we are ending the previous span
  if (shouldEndCurrentSpan) {
    spanEnd(span);
  }

  spanStart(tracer, span, currentRouteName, customAttributes, isInitialView);

  // last step before it changes the view
  view.current = currentRouteName;
};

export default spanCreator;
export { spanStart, spanEnd, spanCreatorAppState, ATTRIBUTES };
