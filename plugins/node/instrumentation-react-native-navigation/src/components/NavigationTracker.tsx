import { forwardRef, ReactNode } from 'react';
import { TracerProvider } from '@opentelemetry/api';

import useTrace from '../utils/hooks/useTrace';
import useNavigationTracker, { NavRef } from '../hooks/useNavigationTracker';

type NavigationTrackerRef = NavRef;
interface NavigationTrackerProps {
  children: ReactNode;
  // selected provider, configured by the app consumer if global tracer is not enough
  provider?: TracerProvider;
}

const NavigationTracker = forwardRef<
  NavigationTrackerRef,
  NavigationTrackerProps
>(({ children, provider }, ref) => {
  // Initializing a Trace instance
  const tracer = useTrace(
    { name: 'native-navigation', version: '0.1.0' },
    provider
  );

  useNavigationTracker(ref, tracer);

  return <>{children}</>;
});
NavigationTracker.displayName = 'NavigationTracker';

export default NavigationTracker;
export type { NavigationTrackerRef };
