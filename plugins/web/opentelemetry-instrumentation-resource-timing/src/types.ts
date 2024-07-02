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
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import * as api from '@opentelemetry/api';

export interface ResourceTimingInstrumentationConfig extends InstrumentationConfig {

  //TODO: include/exlcude patterns for URLs of the resources.

  /** additional supported initiator types */
  additionalInitiatorTypes?: string[];

}

// TODO: This type is duplicated in fetch2 instrumenatation, how can it moved to a common place?
export interface SpanContextData {
  url: string;
  initiatorType: string;
  startTime: api.HrTime;
  endTime: api.HrTime;
  traceId: string;
  spanId: string;
}

export enum ResourceTimingEventFields {
  NAME = 'name',
  INITATOR_TYPE = 'initiatorType',
  FETCHSTART = 'fetchStart',
  DOMAINLOOKUPSTART = 'domainLookupStart',
  DOMAINLOOKUPEND = 'domainLookupEnd',
  CONNECTSTART = 'connectStart',
  SECURECONNECTIONSTART = 'secureConnectionStart',
  CONNECTEND = 'connectEnd',
  REQUESTSTART = 'requestStart',
  RESPONSESTART = 'responseStart',
  RESPONSEEND = 'responseEnd',
}