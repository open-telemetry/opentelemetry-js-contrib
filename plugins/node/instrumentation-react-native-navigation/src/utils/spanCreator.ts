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

import { TracerRef } from './hooks/useTrace';
import { SpanRef } from './hooks/useSpan';

const ATTRIBUTES = {
  initialView: 'launch',
  finalView: 'unmount',
  appState: 'status.end',
};

const spanStart = (
  tracer: TracerRef,
  span: SpanRef,
  currentRouteName: string,
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
};

const spanEnd = (span: SpanRef, appState?: AppStateStatus) => {
  if (span.current) {
    span.current.setAttribute(ATTRIBUTES.appState, appState ?? 'active');

    span.current.end();

    // make sure we destroy any existent span
    span.current = null;
  }
};

const spanCreatorAppState =
  (tracer: TracerRef, span: SpanRef) =>
  (currentRouteName: string, currentState: AppStateStatus) => {
    if (currentState === null || currentState === undefined) {
      return;
    }

    if (currentState === 'active') {
      spanStart(tracer, span, currentRouteName);
    } else {
      spanEnd(span, currentState);
    }
  };

const spanCreator = (
  tracer: TracerRef,
  span: SpanRef,
  view: MutableRefObject<string | null>,
  currentRouteName: string
) => {
  if (!tracer.current) {
    // do nothing in case for some reason the tracer is not initialized
    return;
  }

  const isFirstView = view.current === null;

  const shouldEndCurrentSpan =
    view.current !== null && view.current !== currentRouteName;

  // it means the view has changed and we are ending the previous span
  if (shouldEndCurrentSpan) {
    spanEnd(span);
  }

  spanStart(tracer, span, currentRouteName, isFirstView);

  // last step before it changes the view
  view.current = currentRouteName;
};

export default spanCreator;
export { spanStart, spanEnd, spanCreatorAppState, ATTRIBUTES };
