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
import { AppState } from 'react-native';
import React, { FC, useRef } from 'react';
import { render } from '@testing-library/react';
import { ATTRIBUTES } from '../src/utils/spanCreator';
import sinon from 'sinon';
import { NativeNavigationTracker } from '../src';
import useProvider from './hooks/useProvider';
import api from '@opentelemetry/api';
import * as rnn from './helpers/react-native-navigation';
import { NavigationTrackerConfig } from '../src/types/navigation';

const AppWithProvider: FC<{
  shouldPassProvider: boolean;
  config?: NavigationTrackerConfig;
}> = ({ shouldPassProvider, config }) => {
  const { Navigation } = rnn;
  const provider = useProvider();
  const ref = useRef(Navigation.events());

  return (
    <NativeNavigationTracker
      ref={ref}
      config={config}
      provider={shouldPassProvider ? provider.current : undefined}
    >
      the app goes here
    </NativeNavigationTracker>
  );
};

describe('NativeNavigationTracker.tsx', function () {
  const sandbox = sinon.createSandbox();
  const mockDidAppearListener = sandbox.spy();
  const mockDidDisappearListener = sandbox.spy();

  let mockConsoleDir: sinon.SinonSpy;
  let mockConsoleInfo: sinon.SinonSpy;
  let mockAddEventListener: sinon.SinonSpy;

  let mockGlobalTracer: sinon.SinonSpy;

  beforeEach(function () {
    const { Navigation } = rnn;
    sandbox.stub(Navigation, 'events').returns({
      registerComponentDidAppearListener: mockDidAppearListener,
      registerComponentDidDisappearListener: mockDidDisappearListener,
    });

    mockAddEventListener = sandbox.spy(AppState, 'addEventListener');
    mockConsoleDir = sandbox.spy(console, 'dir');
    mockConsoleInfo = sandbox.spy(console, 'info');

    mockGlobalTracer = sandbox.spy(api.trace, 'getTracer');
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('should render a component that implements <NativeNavigationTracker /> without passing a provider', function () {
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

    sandbox.assert.calledWith(mockDidAppearListener, sandbox.match.func);

    const mockDidAppearListenerCall = mockDidAppearListener.getCall(0).args[0];

    mockDidAppearListenerCall({ componentName: 'homeView' });
    sandbox.assert.calledWith(mockDidDisappearListener, sandbox.match.func);

    const mockDidDisappearListenerCall =
      mockDidDisappearListener.getCall(0).args[0];

    mockDidDisappearListenerCall({ componentName: 'homeView' });

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

    mockDidAppearListenerCall({ componentName: 'detailsView' });
    mockDidDisappearListenerCall({ componentName: 'detailsView' });

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

  it('should render a component that implements <NativeNavigationTracker /> passing a provider', function () {
    const screen = render(<AppWithProvider shouldPassProvider={true} />);

    // should not call the global `getTracer` function since it should get the provider from props
    sandbox.assert.notCalled(mockGlobalTracer);

    sandbox.assert.calledWith(mockDidAppearListener, sandbox.match.func);
    const mockDidAppearListenerCall = mockDidAppearListener.getCall(1).args[0];

    mockDidAppearListenerCall({ componentName: 'homeView' });

    sandbox.assert.calledWith(mockDidDisappearListener, sandbox.match.func);
    const mockDidDisappearListenerCall =
      mockDidDisappearListener.getCall(1).args[0];

    mockDidDisappearListenerCall({ componentName: 'homeView' });

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

    mockDidAppearListenerCall({ componentName: 'detailsView' });
    mockDidDisappearListenerCall({ componentName: 'detailsView' });

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
    const screen = render(<AppWithProvider shouldPassProvider={true} />);

    const mockDidAppearListenerCall = mockDidAppearListener.getCall(2).args[0];
    const mockDidDisappearListenerCall =
      mockDidDisappearListener.getCall(2).args[0];

    const handleAppStateChange = mockAddEventListener.getCall(0).args[1];

    // app launches
    mockDidAppearListenerCall({ componentName: 'homeView' });
    // app goes to background
    handleAppStateChange('background');

    // at this point it should grab the first span adding 'background' as app state
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

    // back to foreground
    handleAppStateChange('active');
    // user navigates to another view so the previous one disappears. it should end the previous span
    mockDidDisappearListenerCall({
      componentName: 'homeView',
    });

    // user gets the next view after navigate
    mockDidAppearListenerCall({ componentName: 'detailsView' });

    // at this point a new span should be created with the same name but saying it's in 'active' state (foreground)
    sandbox.assert.calledWith(
      mockConsoleDir,
      sinon.match({
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

    // and for that reason it should create a new span with the same name but in 'background' state
    sandbox.assert.calledWith(
      mockConsoleDir,
      sinon.match({
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

    const mockDidAppearListenerCall = mockDidAppearListener.getCall(3).args[0];
    const mockDidDisappearListenerCall =
      mockDidDisappearListener.getCall(3).args[0];

    mockDidAppearListenerCall({ componentName: 'homeCustomAttributesView' });
    mockDidDisappearListenerCall({ componentName: 'homeCustomAttributesView' });

    sandbox.assert.calledOnceWithMatch(
      mockConsoleDir,
      sandbox.match({
        name: 'homeCustomAttributesView',
        traceId: sandbox.match.string,
        attributes: {
          [ATTRIBUTES.initialView]: true,
          'custom.attribute': 'custom.value',
          'custom.extra.attribute': 'custom.extra.value',
          [ATTRIBUTES.appState]: 'active',
          [ATTRIBUTES.viewName]: 'homeCustomAttributesView',
        },
        timestamp: sandbox.match.number,
        duration: sandbox.match.number,
      }),
      sandbox.match({ depth: sandbox.match.number })
    );

    sandbox.assert.match(!!screen.getByText('the app goes here'), true);
  });
});
