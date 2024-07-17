import { AppState } from 'react-native';
import React, { useRef } from 'react';
import { render } from '@testing-library/react';
import { ATTRIBUTES } from '../src/utils/spanCreator';
import sinon from 'sinon';
import { NativeNavigationTracker } from '../src';
import useProvider from './hooks/useProvider';
import * as rnn from './helpers/react-native-navigation';

const AppWithProvider = ({ shouldPassProvider = true }) => {
  const { Navigation } = rnn;
  const provider = useProvider();
  const ref = useRef(Navigation.events());

  return (
    <NativeNavigationTracker
      ref={ref}
      provider={shouldPassProvider ? provider.current : undefined}
    >
      my app goes here
    </NativeNavigationTracker>
  );
};

describe('NativeNavigationTracker.tsx', function () {
  const sandbox = sinon.createSandbox();
  const mockDidAppearListener = sandbox.spy();
  const mockDidDisappearListener = sandbox.spy();

  let mockConsoleDir: sinon.SinonSpy;
  let mockAddEventListener: sinon.SinonSpy;

  beforeEach(function () {
    const { Navigation } = rnn;
    sandbox.stub(Navigation, 'events').returns({
      registerComponentDidAppearListener: mockDidAppearListener,
      registerComponentDidDisappearListener: mockDidDisappearListener,
    });

    mockAddEventListener = sandbox.spy(AppState, 'addEventListener');
    mockConsoleDir = sandbox.spy(console, 'dir');
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('should render a component that implements <NativeNavigationTracker /> without passing a provider', async function () {
    // const screen =
    render(<AppWithProvider shouldPassProvider={false} />);

    sandbox.assert.calledWith(mockDidAppearListener, sandbox.match.func);

    const mockDidAppearListenerCall = mockDidAppearListener.getCall(0).args[0];

    mockDidAppearListenerCall({ componentName: 'initial-test-view' });
    sandbox.assert.calledWith(mockDidDisappearListener, sandbox.match.func);

    const mockDidDisappearListenerCall =
      mockDidDisappearListener.getCall(0).args[0];

    mockDidDisappearListenerCall({ componentName: 'initial-test-view' });

    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: 'initial-test-view',
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

    mockDidAppearListenerCall({ componentName: 'second-test-view' });
    mockDidDisappearListenerCall({ componentName: 'second-test-view' });

    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: 'second-test-view',
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

  it('should render a component that implements <NativeNavigationTracker /> passing a custom provider', function () {
    // const screen =
    render(<AppWithProvider shouldPassProvider={true} />);

    sandbox.assert.calledWith(mockDidAppearListener, sandbox.match.func);
    const mockDidAppearListenerCall = mockDidAppearListener.getCall(1).args[0];

    mockDidAppearListenerCall({ componentName: 'initial-test-view' });

    sandbox.assert.calledWith(mockDidDisappearListener, sandbox.match.func);
    const mockDidDisappearListenerCall =
      mockDidDisappearListener.getCall(1).args[0];

    mockDidDisappearListenerCall({ componentName: 'initial-test-view' });

    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: 'initial-test-view',
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

    mockDidAppearListenerCall({ componentName: 'second-test-view' });
    mockDidDisappearListenerCall({ componentName: 'second-test-view' });

    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: 'second-test-view',
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

  it('should start and end spans when the app changes the status between foreground/background', function () {
    // const screen =
    render(<AppWithProvider shouldPassProvider={true} />);

    const mockDidAppearListenerCall = mockDidAppearListener.getCall(2).args[0];
    const mockDidDisappearListenerCall =
      mockDidDisappearListener.getCall(2).args[0];

    const handleAppStateChange = mockAddEventListener.getCall(0).args[1];

    mockDidAppearListenerCall({ componentName: 'initial-view-after-launch' });

    handleAppStateChange('background');

    sandbox.assert.calledWith(
      mockConsoleDir,
      sandbox.match({
        name: 'initial-view-after-launch',
        traceId: sinon.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: true,
          [ATTRIBUTES.appState]: 'background',
        },
        timestamp: sinon.match.number,
        duration: sinon.match.number,
      }),
      sandbox.match({ depth: sandbox.match.number })
    );

    handleAppStateChange('active');

    mockDidDisappearListenerCall({
      componentName: 'initial-view-after-launch',
    });

    mockDidAppearListenerCall({ componentName: 'next-view' });

    sandbox.assert.calledWith(
      mockConsoleDir,
      sinon.match({
        name: 'initial-view-after-launch',
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

    handleAppStateChange('background');

    sandbox.assert.calledWith(
      mockConsoleDir,
      sinon.match({
        name: 'next-view',
        traceId: sinon.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: false,
          [ATTRIBUTES.appState]: 'background',
        },
        timestamp: sinon.match.number,
        duration: sinon.match.number,
      }),
      sandbox.match({ depth: sandbox.match.number })
    );

    handleAppStateChange('active');
    // sandbox.assert.match(screen.getByText('my app goes here'), true);
  });
});
