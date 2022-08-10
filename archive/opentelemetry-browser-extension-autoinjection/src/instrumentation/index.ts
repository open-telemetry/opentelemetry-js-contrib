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

import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import {
  DomAttributes,
  DomElements,
  InstrumentationType,
  Settings,
} from '../types';
import { WebInstrumentation } from './WebInstrumentation';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const configTag = document.getElementById(DomElements['CONFIG_TAG']);
const { exporters }: Settings = configTag
  ? JSON.parse(String(configTag.dataset[DomAttributes['CONFIG']]))
  : {};

new WebInstrumentation(
  {
    exporters,
    instrumentations: {
      [InstrumentationType.DOCUMENT_LOAD]: {
        enabled: true,
      },
      [InstrumentationType.FETCH]: {
        enabled: true,
      },
      [InstrumentationType.XML_HTTP_REQUEST]: {
        enabled: true,
      },
    },
    withZoneContextManager: true,
  },
  new WebTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: window.location.hostname,
    }),
  })
).register();
