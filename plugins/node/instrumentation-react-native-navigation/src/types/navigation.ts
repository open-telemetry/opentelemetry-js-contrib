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
import { EventsRegistry } from 'react-native-navigation';
import { ReactNode } from 'react';
import { EventConsumer, EventMapBase, Route } from '@react-navigation/native';
import { Attributes, TracerOptions, TracerProvider } from '@opentelemetry/api';

export type INativeNavigationContainer = Pick<
  EventsRegistry,
  'registerComponentDidDisappearListener' | 'registerComponentDidAppearListener'
>;

export type INavigationContainer = Pick<
  EventConsumer<EventMapBase>,
  'addListener'
> & { getCurrentRoute: () => Route<string> | undefined };

export interface TrackerConfig {
  attributes?: Attributes;
  tracerOptions?: TracerOptions;
  debug?: boolean; // enabling `debug` mode will print console messages (info and warns). useful for debugging
}

export interface TrackerProps {
  children: ReactNode;
  // selected provider, should be configured by the app consumer
  provider?: TracerProvider;
  config?: TrackerConfig;
}
