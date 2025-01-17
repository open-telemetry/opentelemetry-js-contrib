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
import { Attributes, TracerOptions } from '@opentelemetry/api';
import { useNavigationContainerRef as useReactNativeNavigationContainerRef } from '@react-navigation/native';
import { useNavigationContainerRef as useReactNativeNavigationExpoContainerRef } from 'expo-router';
import { Navigation } from 'react-native-navigation';

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

export type INativeNavigationContainer = ReturnType<typeof Navigation.events>;

export type INavigationContainer =
  | ReturnType<typeof useReactNativeNavigationContainerRef>
  | ReturnType<typeof useReactNativeNavigationExpoContainerRef>['current'];

export interface NavigationTrackerConfig {
  attributes?: Attributes;
  tracerOptions?: TracerOptions;
  debug?: boolean; // enabling `debug` mode will print console messages (info and warns). useful for debugging
}
