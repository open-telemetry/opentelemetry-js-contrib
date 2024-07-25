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
import { forwardRef, ReactNode } from 'react';
import { TracerProvider } from '@opentelemetry/api';

import useTraceRef from '../utils/hooks/useTracerRef';
import useNativeNavigationTracker, {
  NativeNavRef,
} from '../hooks/useNativeNavigationTracker';
import { NavigationTrackerConfig } from '../types/navigation';

type NativeNavigationTrackerRef = NativeNavRef;

interface NativeNavigationTrackerProps {
  children: ReactNode;
  // selected provider, should be configured by the app consumer
  provider?: TracerProvider;
  config?: NavigationTrackerConfig;
}

const NativeNavigationTracker = forwardRef<
  NativeNavigationTrackerRef,
  NativeNavigationTrackerProps
>(({ children, provider, config }, ref) => {
  // Initializing a Trace instance
  const tracer = useTraceRef(provider, config);

  useNativeNavigationTracker(ref, tracer, config);

  return <>{children}</>;
});

NativeNavigationTracker.displayName = 'NativeNavigationTracker';
export default NativeNavigationTracker;
export type { NativeNavigationTrackerRef };
