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
import { ForwardedRef, useCallback, useEffect, useMemo, useRef } from 'react';

import spanCreator, {
  spanCreatorAppState,
  spanEnd,
} from '../utils/spanCreator';
import { TracerRef } from '../utils/hooks/useTrace';
import useSpan from '../utils/hooks/useSpan';
import {
  INativeNavigationContainer,
  NavigationTrackerConfig,
} from '../types/navigation';

import useAppStateListener from './useAppStateListener';

export type NativeNavRef = INativeNavigationContainer;

const useNativeNavigationTracker = (
  ref: ForwardedRef<NativeNavRef>,
  tracer: TracerRef,
  config?: NavigationTrackerConfig
) => {
  const { attributes: customAttributes } = config ?? {};

  const navigationElRef = useMemo(() => {
    const isMutableRef = ref !== null && typeof ref !== 'function';
    return isMutableRef ? ref.current : undefined;
  }, [ref]);

  const navView = useRef<string | null>(null);

  // Initializing a Span
  const span = useSpan();

  useEffect(() => {
    if (!navigationElRef) {
      console.warn(
        'Navigation ref is not available. Make sure this is properly configured.'
      );

      // do nothing in case for some reason there is no navigationElRef
      return;
    }

    navigationElRef.registerComponentDidAppearListener(({ componentName }) => {
      if (!componentName) {
        console.warn(
          'Navigation component name is not available. Make sure this is properly configured.'
        );

        // do nothing in case for some reason there is no route
        return;
      }

      spanCreator(tracer, span, navView, componentName, customAttributes);
    });

    navigationElRef.registerComponentDidDisappearListener(
      ({ componentName }) => {
        if (!componentName) {
          console.warn(
            'Navigation component name is not available. Make sure this is properly configured.'
          );

          // do nothing in case for some reason there is no route
          return;
        }

        spanEnd(span);
      }
    );
  }, [navigationElRef, span, tracer, customAttributes]);

  useEffect(
    () => () => {
      // making sure the final span is ended when the app is unmounted
      const isFinalView = true;
      spanEnd(span, undefined, isFinalView);
    },
    [span]
  );

  const handleAppStateListener = useCallback(
    (currentState: AppStateStatus) => {
      const appStateHandler = spanCreatorAppState(
        tracer,
        span,
        customAttributes
      );

      if (navView?.current === null) {
        return;
      }

      appStateHandler(navView?.current, currentState);
    },
    [span, tracer, customAttributes]
  );

  useAppStateListener(handleAppStateListener);
};

export default useNativeNavigationTracker;
