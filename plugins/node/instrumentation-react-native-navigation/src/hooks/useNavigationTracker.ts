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
import { INavigationContainer } from '../types/navigation';

import useAppStateListener from './useAppStateListener';

export type NavRef = INavigationContainer;

const useNavigationTracker = (ref: ForwardedRef<NavRef>, tracer: TracerRef) => {
  const navigationElRef = useMemo(() => {
    const isMutableRef = ref !== null && typeof ref !== 'function';
    return isMutableRef ? ref.current : undefined;
  }, [ref]);

  // tracking specific (no otel related)
  const navView = useRef<string | null>(null);

  // Initializing a Span
  const span = useSpan();

  useEffect(() => {
    if (navigationElRef) {
      navigationElRef.addListener('state', () => {
        const { name: routeName } = navigationElRef.getCurrentRoute() ?? {};

        if (!routeName) {
          // do nothing in case for some reason there is no route
          return;
        }

        spanCreator(tracer, span, navView, routeName);
      });
    }
  }, [navigationElRef, span, tracer]);

  useEffect(
    () => () => {
      // making sure the final span is ended when the app is unmounted
      spanEnd(span);
    },
    [span]
  );

  const handleAppStateListener = useCallback(
    (currentState: AppStateStatus) => {
      const appStateHandler = spanCreatorAppState(tracer, span);

      if (navView?.current === null) {
        return;
      }

      appStateHandler(navView?.current, currentState);
    },
    [span, tracer]
  );

  useAppStateListener(handleAppStateListener);
};

export default useNavigationTracker;
