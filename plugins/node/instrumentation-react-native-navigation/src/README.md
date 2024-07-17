# OpenTelemetry Navigation Instrumentation for React Native

This module provides instrumentation for [react-native/nagivation](https://reactnavigation.org/docs/getting-started), [expo-router](https://docs.expo.dev/router/introduction/) and [wix/react-native-navigation](https://wix.github.io/react-native-navigation/docs/before-you-start/)

## Installation
```
npm i @embrace-io/react-native
```

or if you use yarn

```
yarn add @embrace-io/react-native
```

## Supported Versions
  - Nodejs `>=14`

## Usage
This package is designed to streamline your workflow by requiring minimal setup. To use this package, you only need to pass a reference and a provider.

If you are using `expo-router` or `react-native/navigation` you need to wrap your entire application with the `NavigationTracker` component.

```javascript
import {FC} from 'react';
import {Stack, useNavigationContainerRef} from 'expo-router';
import {NavigationTracker} from '@embrace/react-native/experimental/navigation';

const App: FC = () => {
  const navigationRef = useNavigationContainerRef(); // if you do not use `expo-router` the same hook is also available in `@react-navigation/native` since `expo-router` is built on top of it
  const provider = useProvider(); // the provider is something you need to configure and pass down as prop into the `NavigationTracker` component

  return (
    <NavigationTracker ref={navigationRef} provider={provider}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{headerShown: false}} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </NavigationTracker>
  );
};

export default App;
```

If you are using `wix/react-native-navigation` you are also able to track navigation changes by importing and implement the `NativeNavigationTracker` component. The purpose in here is to wrap the entire application with the exposed component.

```javascript
import {FC} from 'react';
import {NativeNavigationTracker} from '@embrace/react-native/experimental/navigation';
import {Navigation} from "react-native-navigation";

Navigation.registerComponent('Home', () => HomeScreen);

Navigation.events().registerAppLaunchedListener(async () => {
  Navigation.setRoot({
    root: {
      stack: {
        children: [
          {
            component: {
              name: 'Home'
            }
          }
        ]
      }
    }
  });
});

const HomeScreen: FC = () => {
  const navigationRef = useRef(Navigation.events()); // this is the important part. Make sure you pass a reference with the return of Navigation.events();
  const provider = useProvider(); // again, the provider should be passed down into the `NativeNavigationTracker` with the selected exporter and processor configured

  return (
    <NativeNavigationTracker ref={navigationRef} provider={provider}>
      {/* content of the app goes here */}
    </NavigationTracker>
  );
};

export default App;
```

## Goal
The purpose of this package is to intercept changes in the navigation of a React Native application and create telemetry data following the OpenTelemetry standards. Every new view displayed will start a new Span, which will end only when the next view becomes available to the user.

For instance, when the application starts and the user navigates to a new section, the first Span will be considered finished at that moment. Let’s take a look at the output of this Span:

```
{
  resource: {
    attributes: {
      'service.name': 'unknown_service:/Users/testuser/.nvm/versions/node/v18.18.0/bin/node',
      'telemetry.sdk.language': 'nodejs',
      'telemetry.sdk.name': 'opentelemetry',
      'telemetry.sdk.version': '1.25.0'
    }
  },
  traceId: 'a3280f7e6afab1e5b7f4ecfc12ec059f',
  parentId: undefined,
  traceState: undefined,
  name: 'initial-test-view',
  id: '270509763b408343',
  kind: 0,
  timestamp: 1718975153696000,
  duration: 252.375,
  attributes: { initial_view: true },
  status: { code: 0 },
  events: [],
  links: []
}
```

### NOTE
`useProvider` hook in this example returns an instance of a configured provided.
It doesn't matter which provider you choose; you just need to pass down one (if needed) with all your configurations. To create that provider, you may want to refer to the official [OpenTelemetry JS documentation](https://github.com/open-telemetry/opentelemetry-js). You can also review our suggested implementation (`experimental/testUtils/hooks/useProvider.ts`), but keep in mind that this is the simplest provider with minimal configurations.
