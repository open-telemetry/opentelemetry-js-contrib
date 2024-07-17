import { forwardRef, ReactNode } from 'react';
import { TracerProvider } from '@opentelemetry/api';

import useTrace from '../utils/hooks/useTrace';
import useNativeNavigationTracker, {
  NativeNavRef,
} from '../hooks/useNativeNavigationTracker';

export type NativeNavigationTrackerRef = NativeNavRef;

interface NativeNavigationTrackerProps {
  children: ReactNode;
  // selected provider, should be configured by the app consumer
  provider?: TracerProvider;
}

const NativeNavigationTracker = forwardRef<
  NativeNavigationTrackerRef,
  NativeNavigationTrackerProps
>(({ children, provider }, ref) => {
  // Initializing a Trace instance
  const tracer = useTrace(
    { name: 'native-navigation', version: '0.1.0' },
    provider
  );

  useNativeNavigationTracker(ref, tracer);

  return <>{children}</>;
});

NativeNavigationTracker.displayName = 'NativeNavigationTracker';
export default NativeNavigationTracker;
