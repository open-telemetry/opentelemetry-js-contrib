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
import { AppState, AppStateStatus } from 'react-native';
import { MutableRefObject, useCallback, useEffect } from 'react';
import { spanCreatorAppState } from '../utils/spanFactory';
import { TracerRef } from '../utils/hooks/useTracerRef';
import { SpanRef } from '../utils/hooks/useSpanRef';
import { Attributes } from '@opentelemetry/api';

const useAppStateListener = (
  tracer: TracerRef,
  span: SpanRef,
  view: MutableRefObject<string | null>,
  attributes?: Attributes
) => {
  /**
   * App State Span Factory
   */
  const initAppStateSpan = useCallback(
    (currentState: AppStateStatus) => {
      const appStateHandler = spanCreatorAppState(tracer, span, attributes);

      if (view?.current === null) {
        return;
      }

      appStateHandler(view?.current, currentState);
    },
    [span, tracer, attributes]
  );

  /**
   * App State Listener changes
   */
  useEffect(() => {
    const handleAppStateChange = (currentState: AppStateStatus) => {
      initAppStateSpan(currentState);
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );

    return () => {
      subscription.remove();
    };
  }, [initAppStateSpan]);
};

export default useAppStateListener;
