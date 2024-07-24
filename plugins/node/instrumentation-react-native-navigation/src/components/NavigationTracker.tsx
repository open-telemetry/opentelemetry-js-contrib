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
import { TracerOptions, TracerProvider } from '@opentelemetry/api';

import useTrace from '../utils/hooks/useTrace';
import useNavigationTracker, { NavRef } from '../hooks/useNavigationTracker';
import { NavigationTrackerConfig } from '../types/navigation';

type NavigationTrackerRef = NavRef;

interface NavigationTrackerProps {
  children: ReactNode;
  // selected provider, configured by the app consumer if global tracer is not enough
  provider?: TracerProvider;
  // in case a provider is passed
  options?: TracerOptions;
  config?: NavigationTrackerConfig;
}

const NavigationTracker = forwardRef<
  NavigationTrackerRef,
  NavigationTrackerProps
>(({ children, provider, options, config }, ref) => {
  // Initializing a Trace instance
  const tracer = useTrace(provider, options);

  useNavigationTracker(ref, tracer, config);

  return <>{children}</>;
});
NavigationTracker.displayName = 'NavigationTracker';

export default NavigationTracker;
export type { NavigationTrackerRef };
