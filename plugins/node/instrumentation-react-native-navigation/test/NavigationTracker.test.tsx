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
import { FC, ForwardedRef } from 'react';
import React, { render } from '@testing-library/react';

import useProvider from './hooks/useProvider';

import { NavRef } from '../src/hooks/useNavigationTracker';
import { ATTRIBUTES } from '../src/utils/spanFactory';
import sinon from 'sinon';
import { NavigationTracker } from '../src';

import { AppState } from 'react-native';
import api from '@opentelemetry/api';
import * as rnn from './helpers/react-navigation-native';
import { NavigationTrackerConfig } from '../src/types/navigation';

const AppWithProvider: FC<{
  shouldPassProvider: boolean;
  config?: NavigationTrackerConfig;
}> = ({ shouldPassProvider, config }) => {
  const { useNavigationContainerRef } = rnn;
  const ref = useNavigationContainerRef();
  const provider = useProvider();

  return (
    <NavigationTracker
      ref={ref as unknown as ForwardedRef<NavRef>}
      config={config}
      provider={shouldPassProvider ? provider.current : undefined}
    >
      the app goes here
    </NavigationTracker>
  );
};

describe('NavigationTracker.tsx', function () {
  const sandbox = sinon.createSandbox();

  const mockAddListener = sandbox.stub();
  const mockGetCurrentRoute = sandbox.stub();

  let mockAddEventListener: sinon.SinonSpy;
  let mockConsoleDir: sinon.SinonSpy;
  let mockConsoleInfo: sinon.SinonSpy;

  let mockGlobalTracer: sinon.SinonSpy;

  beforeEach(function () {
    sandbox.stub(rnn, 'useNavigationContainerRef').callsFake(
      () =>
        ({
          current: {
            getCurrentRoute: mockGetCurrentRoute,
            addListener: mockAddListener,
          },
        } as unknown as ReturnType<typeof rnn.useNavigationContainerRef>)
    );

    mockAddEventListener = sandbox.spy(AppState, 'addEventListener');
    mockConsoleDir = sandbox.spy(console, 'dir');
    mockConsoleInfo = sandbox.spy(console, 'info');

    mockGlobalTracer = sandbox.spy(api.trace, 'getTracer');
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('should render a component that implements <NavigationTracker /> without passing a provider', function () {
    const screen = render(
      <AppWithProvider shouldPassProvider={false} config={{ debug: true }} />
    );

    sandbox.assert.calledOnceWithExactly(
      mockConsoleInfo,
      'No TracerProvider found. Using global tracer instead.'
    );

    sandbox.assert.calledOnceWithExactly(
      mockGlobalTracer,
      '@opentelemetry/instrumentation-react-native-navigation',
      sandbox.match.string
    );

    sandbox.assert.calledWith(mockAddListener, 'state', sandbox.match.func);
    const mockNavigationListenerCall = mockAddListener.getCall(0).args[1];

    mockGetCurrentRoute.returns({ name: 'homeView' });
    mockNavigationListenerCall();

    mockGetCurrentRoute.returns({ name: 'detailsView' });
    mockNavigationListenerCall();

    // after render a view and then navigate to a different one the spanEnd should be called and it should register a complete span
    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: 'homeView',
        traceId: sandbox.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: true,
          [ATTRIBUTES.appState]: 'active',
          [ATTRIBUTES.viewName]: 'homeView',
        },
        timestamp: sandbox.match.number,
        duration: sandbox.match.number,
      }),
      sandbox.match({ depth: sandbox.match.number })
    );

    mockGetCurrentRoute.returns({ name: 'detailsView' });
    mockNavigationListenerCall();

    mockGetCurrentRoute.returns({ name: 'extraView' });
    mockNavigationListenerCall();

    // again after render a view and then navigate to a different one (the third) the spanEnd should be called and it should register a complete span
    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: 'detailsView',
        traceId: sandbox.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: false,
          [ATTRIBUTES.appState]: 'active',
          [ATTRIBUTES.viewName]: 'detailsView',
        },
        timestamp: sandbox.match.number,
        duration: sandbox.match.number,
      }),
      sandbox.match({ depth: sandbox.match.number })
    );

    sandbox.assert.match(!!screen.getByText('the app goes here'), true);
  });

  it('should render a component that implements <NavigationTracker /> passing a provider', function () {
    const screen = render(<AppWithProvider shouldPassProvider={true} />);

    // should not call the global `getTracer` function since it should get the provider from props
    sandbox.assert.notCalled(mockGlobalTracer);

    sandbox.assert.calledWith(mockAddListener, 'state', sandbox.match.func);
    const mockNavigationListenerCall = mockAddListener.getCall(1).args[1];

    mockGetCurrentRoute.returns({ name: 'homeView' });
    mockNavigationListenerCall();

    mockGetCurrentRoute.returns({ name: 'detailsView' });
    mockNavigationListenerCall();

    // after render a view and then navigate to a different one the spanEnd should be called and it should register a complete span
    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: 'homeView',
        traceId: sandbox.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: true,
          [ATTRIBUTES.appState]: 'active',
          [ATTRIBUTES.viewName]: 'homeView',
        },
        timestamp: sandbox.match.number,
        duration: sandbox.match.number,
      }),
      sandbox.match({ depth: sandbox.match.number })
    );

    mockGetCurrentRoute.returns({ name: 'detailsView' });
    mockNavigationListenerCall();

    mockGetCurrentRoute.returns({ name: 'extraView' });
    mockNavigationListenerCall();

    // again after render a view and then navigate to a different one (the third) the spanEnd should be called and it should register a complete span
    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: 'detailsView',
        traceId: sandbox.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: false,
          [ATTRIBUTES.appState]: 'active',
          [ATTRIBUTES.viewName]: 'detailsView',
        },
        timestamp: sandbox.match.number,
        duration: sandbox.match.number,
      }),
      sandbox.match({ depth: sandbox.match.number })
    );

    sandbox.assert.match(!!screen.getByText('the app goes here'), true);
  });

  it('should start and end spans when the app changes the status between foreground/background', function () {
    // app launches
    const screen = render(<AppWithProvider shouldPassProvider={true} />);

    const mockNavigationListenerCall = mockAddListener.getCall(2).args[1];
    const handleAppStateChange = mockAddEventListener.getCall(0).args[1];

    // app launches, navigation listener is called
    mockGetCurrentRoute.returns({ name: 'homeView' });
    // - start the first span
    mockNavigationListenerCall();

    // app goes to background
    handleAppStateChange('background');

    // - end the first span (without changing the navigation)
    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: 'homeView',
        traceId: sandbox.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: true,
          [ATTRIBUTES.appState]: 'background',
          [ATTRIBUTES.viewName]: 'homeView',
        },
        timestamp: sandbox.match.number,
        duration: sandbox.match.number,
      }),
      sandbox.match({ depth: sandbox.match.number })
    );

    // app goes back to foreground
    handleAppStateChange('active');

    // - start the second span (same view)

    // app navigates to a different view
    mockGetCurrentRoute.returns({ name: 'detailsView' });
    mockNavigationListenerCall();

    // - end the second span
    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: 'homeView',
        traceId: sandbox.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: false,
          [ATTRIBUTES.appState]: 'active',
          [ATTRIBUTES.viewName]: 'homeView',
        },
        timestamp: sandbox.match.number,
        duration: sandbox.match.number,
      }),
      sandbox.match({ depth: sandbox.match.number })
    );

    // app goes to background
    handleAppStateChange('background');

    // - end the third span
    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: 'detailsView',
        traceId: sandbox.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: false,
          [ATTRIBUTES.appState]: 'background',
          [ATTRIBUTES.viewName]: 'detailsView',
        },
        timestamp: sandbox.match.number,
        duration: sandbox.match.number,
      }),
      sandbox.match({ depth: sandbox.match.number })
    );

    handleAppStateChange('active');

    sandbox.assert.match(!!screen.getByText('the app goes here'), true);
  });

  it('should create spans with custom attributes', function () {
    const screen = render(
      <AppWithProvider
        shouldPassProvider={true}
        config={{
          attributes: {
            'custom.attribute': 'custom.value',
            'custom.extra.attribute': 'custom.extra.value',
          },
        }}
      />
    );

    const mockNavigationListenerCall = mockAddListener.getCall(3).args[1];

    mockGetCurrentRoute.returns({ name: 'homeCustomAttributes' });
    mockNavigationListenerCall();

    mockGetCurrentRoute.returns({ name: 'extraCustomAttributes' });
    mockNavigationListenerCall();

    sandbox.assert.calledOnceWithMatch(
      mockConsoleDir,
      sandbox.match({
        name: 'homeCustomAttributes',
        traceId: sandbox.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: true,
          'custom.attribute': 'custom.value',
          'custom.extra.attribute': 'custom.extra.value',
          [ATTRIBUTES.appState]: 'active',
          [ATTRIBUTES.viewName]: 'homeCustomAttributes',
        },
        timestamp: sandbox.match.number,
        duration: sandbox.match.number,
      }),
      sandbox.match({ depth: sandbox.match.number })
    );

    sandbox.assert.match(!!screen.getByText('the app goes here'), true);
  });
});
