# OpenTelemetry Navigation Instrumentation for React Native

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides instrumentation for [react-native/nagivation](https://reactnavigation.org/docs/getting-started), [expo-router](https://docs.expo.dev/router/introduction/) and [wix/react-native-navigation](https://wix.github.io/react-native-navigation/docs/before-you-start/)

## Installation
```
npm i @opentelemetry/instrumentation-react-native-navigation @opentelemetry/api
```

or if you use yarn

```
yarn add @opentelemetry/instrumentation-react-native-navigation @opentelemetry/api
```

## Supported Versions
  - Nodejs `>=14`

## Usage
This package is designed to streamline your workflow by requiring minimal setup. To use this package, you only need to pass a reference and a optionally provider (the global one will be used by default)

If you are using `expo-router` or `react-native/navigation` you need to wrap your entire application with the `NavigationTracker` component.

```javascript
import {FC, useMemo} from 'react';
import {Stack, useNavigationContainerRef} from 'expo-router';
import {NavigationTracker} from '@opentelemetry/instrumentation-react-native-navigation';
import {useProvider} from "./test/hooks/useProvider";

const App: FC = () => {
  const navigationRef = useNavigationContainerRef(); // if you do not use `expo-router` the same hook is also available in `@react-navigation/native` since `expo-router` is built on top of it. Just make sure this ref is passed also to the navigation container at the root of your app (if not, the ref would be empty and you will get a console.warn message instead).

  const provider = useProvider(); // the provider is something you need to configure and pass down as prop into the `NavigationTracker` component (this hook is not part of the package, it is just used here as a reference)
  // If your choice is not to pass any custom tracer provider, the <NavigationTracker /> component will use the global one.
  // In both cases you have to make sure a tracer provider is registered BEFORE you attempt to record the first span.

  // you can also pass a config prop that accepts the `attributes` key. these static attributes will be passed into each created span.
  const config = useMemo(() => ({
    tracerOptions: {
      schemaUrl: "",
    },
    attributes: {
      "static.attribute.key": "static.attribute.value",
      "custom.attribute.key": "custom.attribute.value",
    },
    debug: false, // if set to `true`, it will print console messages (info and warns) for debugging purposes
  }), []);

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
import {FC, useRef} from 'react';
import {NativeNavigationTracker} from '@opentelemetry/instrumentation-react-native-navigation';
import {Navigation} from "react-native-navigation";
import {HomeScreen} from "src/components";
import {useProvider} from "./test/hooks/useProvider";

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

  const provider = useProvider(); // again, the provider should be passed down into the `NativeNavigationTracker` with the selected exporter and processor configured (this hook is not part of the package, it is just used here as a reference)
  // If your choice is not to pass any custom tracer provider, the <NavigationTracker /> component will use the global one.
  // In both cases you have to make sure a tracer provider is registered BEFORE you attempt to record the first span. 

  const config = useMemo(() => ({
    tracerOptions: {
      schemaUrl: "",
    },
    attributes: {
      "static.attribute.key": "static.attribute.value",
      "custom.attribute.key": "custom.attribute.value",
    },
    debug: false, // if set to `true`, it will print console messages (info and warns) for debugging purposes
  }), []);

  return (
    <NativeNavigationTracker ref={navigationRef} provider={provider} config={config}>
      {/* content of the app goes here */}
    </NavigationTracker>
  );
};

export default App;
```

## Goal

The purpose of this package is to intercept changes in the navigation of a React Native application and create telemetry data following the OpenTelemetry standards. Every new view displayed will start a new Span, which will end ONLY when the next view becomes available to the user.

For instance, when the application starts and the user navigates to a new section, the first Span will be considered finished at that moment. Let’s take a look at the output of this Span:

```
{
  resource: {
    attributes: {
      'service.name': 'navigation',
      'telemetry.sdk.language': 'nodejs',
      'telemetry.sdk.name': 'opentelemetry',
      'telemetry.sdk.version': '1.25.0'
    }
  },
  traceId: 'a3280f7e6afab1e5b7f4ecfc12ec059f',
  parentId: undefined,
  traceState: undefined,
  name: 'Home',
  id: '270509763b408343',
  kind: 0,
  timestamp: 1718975153696000,
  duration: 252.375,
  attributes: {
    'view.launch': true,
    'view.state.end': 'active',
    'view.name': 'Home',
    'static.attribute.key': 'static.attribute.value',
    'custom.attribute.key': 'custom.attribute.value'
  },
  status: { code: 0 },
  events: [],
  links: []
}
```

If you dig into the attributes, `view.launch` refers to the moment the app is launched. It will be `true` only the first time the app mounts. Changing the status between background/foreground won't modify this attribute. For this case the `view.state.end` is used, and it can contain two possible values: `active` and `background`.

Both components (<NavigationTracker /> and <NativeNavigationTracker />) are built on top of third-party libraries and function according to the respective APIs exposed by those libraries.

As mentioned before, <NavigationTracker /> relies on `@react-native/navigation` and `expo-router`, implementing the `state` listener to detect changes during navigation. `<NativeNavigationTracker />` leverages the capabilities of `wix/react-native-navigation`, internally implementing the `registerComponentDidAppearListener` and `registerComponentDidDisappearListener` methods provided by the library.

### Note

`useProvider` hook in this example returns an instance of a configured provided.
It doesn't matter which provider you choose; you just need to pass down one (if needed) with all your configurations. To create that provider, you may want to refer to the official [OpenTelemetry JS documentation](https://github.com/open-telemetry/opentelemetry-js). You can also review our suggested implementation (`experimental/testUtils/hooks/useProvider.ts`), but keep in mind that this is the simplest provider with minimal configurations.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-react-native-navigation
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-react-native-navigation.svg
