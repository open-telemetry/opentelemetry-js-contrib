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
import { CloudWatchLogsEvent } from 'aws-lambda';
import { Attributes, SpanKind } from '@opentelemetry/api';
import { LambdaTrigger, TriggerSpanInitializerResult } from './common';
import { TriggerOrigin } from './index';

const isEventBridgeEvent = (event: any): event is CloudWatchLogsEvent => {
  return (
    event &&
    typeof event === 'object' &&
    'awslogs' in event &&
    typeof event.awslogs === 'object' &&
    'data' in event.awslogs &&
    typeof event.awslogs.data === 'object'
  );
};

function initializeEventBridgeSpan(
  event: CloudWatchLogsEvent
): TriggerSpanInitializerResult {
  const attributes: Attributes = {};
  const name = 'cloudwatch log event';
  const options = {
    kind: SpanKind.SERVER,
    attributes,
  };
  return { name, options, origin: TriggerOrigin.EVENT_BRIDGE };
}

export const CloudWatchLogsTrigger: LambdaTrigger<CloudWatchLogsEvent> = {
  validator: isEventBridgeEvent,
  initializer: initializeEventBridgeSpan,
};
