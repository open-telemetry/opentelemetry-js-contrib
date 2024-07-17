import { ForwardedRef } from 'react';
import React, { render } from '@testing-library/react';

import useProvider from './hooks/useProvider';

import { NavRef } from '../src/hooks/useNavigationTracker';
import { ATTRIBUTES } from '../src/utils/spanCreator';
import sinon from 'sinon';
import { NavigationTracker } from '../src';

import { AppState } from 'react-native';
import * as rnn from './helpers/react-navigation-native';

const AppWithProvider = ({ shouldPassProvider = true }) => {
  const { useNavigationContainerRef } = rnn;
  const ref = useNavigationContainerRef();
  const provider = useProvider();

  return (
    <NavigationTracker
      ref={ref as unknown as ForwardedRef<NavRef>}
      provider={shouldPassProvider ? provider.current : undefined}
    >
      my app goes here
    </NavigationTracker>
  );
};

describe('NavigationTracker.tsx', function () {
  const sandbox = sinon.createSandbox();

  const mockAddListener = sandbox.stub();
  const mockGetCurrentRoute = sandbox.stub();

  let mockAddEventListener: sinon.SinonSpy;
  let mockConsoleDir: sinon.SinonSpy;

  beforeEach(function () {
    sandbox.stub(rnn, 'useNavigationContainerRef').callsFake(() => ({
      // @ts-ignore
      current: {
        getCurrentRoute: mockGetCurrentRoute,
        addListener: mockAddListener,
        dispatch: sandbox.stub(),
        navigate: sandbox.stub(),
        reset: sandbox.stub(),
        goBack: sandbox.stub(),
        isReady: sandbox.stub(),
        canGoBack: sandbox.stub(),
        setParams: sandbox.stub(),
        isFocused: sandbox.stub(),
        getId: sandbox.stub(),
        getParent: sandbox.stub().returns('parentId'),
        getState: sandbox.stub(),
      },
    }));

    mockAddEventListener = sandbox.spy(AppState, 'addEventListener');
    mockConsoleDir = sandbox.spy(console, 'dir');
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('should render a component that implements <NavigationTracker /> without passing a provider', async function () {
    // const screen =
    render(<AppWithProvider shouldPassProvider={false} />);

    sandbox.assert.calledWith(mockAddListener, 'state', sandbox.match.func);
    const mockNavigationListenerCall = mockAddListener.getCall(0).args[1];

    mockGetCurrentRoute.returns({ name: '1-first-view-test' });
    mockNavigationListenerCall();

    mockGetCurrentRoute.returns({ name: '1-second-view-test' });
    mockNavigationListenerCall();

    // after render a view and then navigate to a different one the spanEnd should be called and it should register a complete span
    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: '1-first-view-test',
        traceId: sandbox.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: true,
          [ATTRIBUTES.appState]: 'active',
        },
        timestamp: sandbox.match.number,
        duration: sandbox.match.number,
      }),
      sandbox.match({ depth: sandbox.match.number })
    );

    mockGetCurrentRoute.returns({ name: '1-second-view-test' });
    mockNavigationListenerCall();

    mockGetCurrentRoute.returns({ name: '1-third-view-test' });
    mockNavigationListenerCall();

    // again after render a view and then navigate to a different one (the third) the spanEnd should be called and it should register a complete span
    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: '1-second-view-test',
        traceId: sandbox.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: false,
          [ATTRIBUTES.appState]: 'active',
        },
        timestamp: sandbox.match.number,
        duration: sandbox.match.number,
      }),
      sandbox.match({ depth: sandbox.match.number })
    );

    // sandbox.assert.match(screen.getByText('my app goes here'), true);
  });

  it('should render a component that implements <NavigationTracker /> passing a custom provider', function () {
    // const screen =
    render(<AppWithProvider shouldPassProvider={true} />);

    sandbox.assert.calledWith(mockAddListener, 'state', sandbox.match.func);
    const mockNavigationListenerCall = mockAddListener.getCall(1).args[1];

    mockGetCurrentRoute.returns({ name: '2-first-view-test' });
    mockNavigationListenerCall();

    mockGetCurrentRoute.returns({ name: '2-second-view-test' });
    mockNavigationListenerCall();

    // after render a view and then navigate to a different one the spanEnd should be called and it should register a complete span
    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: '2-first-view-test',
        traceId: sandbox.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: true,
          [ATTRIBUTES.appState]: 'active',
        },
        timestamp: sandbox.match.number,
        duration: sandbox.match.number,
      }),
      sandbox.match({ depth: sandbox.match.number })
    );

    mockGetCurrentRoute.returns({ name: '2-second-view-test' });
    mockNavigationListenerCall();

    mockGetCurrentRoute.returns({ name: '1-third-view-test' });
    mockNavigationListenerCall();

    // again after render a view and then navigate to a different one (the third) the spanEnd should be called and it should register a complete span
    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: '2-second-view-test',
        traceId: sinon.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: false,
          [ATTRIBUTES.appState]: 'active',
        },
        timestamp: sinon.match.number,
        duration: sinon.match.number,
      }),
      sandbox.match({ depth: sandbox.match.number })
    );

    // sandbox.assert.match(screen.getByShadowText('my app goes here'), true);
  });

  it('should start and end spans when the app changes the status between foreground/background', function () {
    // app launches
    // const screen =
    render(<AppWithProvider shouldPassProvider={true} />);
    const mockNavigationListenerCall = mockAddListener.getCall(2).args[1];
    const handleAppStateChange = mockAddEventListener.getCall(0).args[1];

    // app launches, navigation listener is called
    mockGetCurrentRoute.returns({ name: '3-initial-view-after-launch' });
    // - start the first span
    mockNavigationListenerCall();

    // app goes to background
    handleAppStateChange('background');

    // - end the first span (without changing the navigation)
    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: '3-initial-view-after-launch',
        traceId: sinon.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: true,
          [ATTRIBUTES.appState]: 'background',
        },
        timestamp: sinon.match.number,
        duration: sinon.match.number,
      }),
      sandbox.match({ depth: sinon.match.number })
    );

    // app goes back to foreground
    handleAppStateChange('active');

    // - start the second span (same view)

    // app navigates to a different view
    mockGetCurrentRoute.returns({ name: '3-next-view' });
    mockNavigationListenerCall();

    // - end the second span
    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: '3-initial-view-after-launch',
        traceId: sinon.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: false,
          [ATTRIBUTES.appState]: 'active',
        },
        timestamp: sinon.match.number,
        duration: sinon.match.number,
      }),
      sandbox.match({ depth: sinon.match.number })
    );

    // app goes to background
    handleAppStateChange('background');

    // - end the third span
    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: '3-next-view',
        traceId: sinon.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: false,
          [ATTRIBUTES.appState]: 'background',
        },
        timestamp: sinon.match.number,
        duration: sinon.match.number,
      }),
      sandbox.match({ depth: sinon.match.number })
    );

    handleAppStateChange('active');

    // sandbox.assert.match(screen.getByShadowText('my app goes here'), true);
  });
});
