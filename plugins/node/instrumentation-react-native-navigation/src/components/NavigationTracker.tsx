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
import * as React from 'react';
import { forwardRef } from 'react';

import useTracerRef from '../utils/hooks/useTracerRef';
import { TrackerProps } from '../types/navigation';
import useNavigationTracker, {
  NavRef as NavigationTrackerRef,
} from '../hooks/useNavigationTracker';

const NavigationTracker = forwardRef<NavigationTrackerRef, TrackerProps>(
  ({ children, provider, config }, ref) => {
    // Initializing a Trace instance
    const tracer = useTracerRef(provider, config);

    useNavigationTracker(ref, tracer, config);

    return <>{children}</>;
  }
);

NavigationTracker.displayName = 'NavigationTracker';

export { NavigationTracker };
export type { NavigationTrackerRef };
