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
import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { Message } from 'kafkajs';

export interface KafkaProducerCustomAttributeFunction {
  (span: Span, topic: string, message: Message): void;
}

export interface KafkaConsumerCustomAttributeFunction {
  (span: Span, topic: string, message: Message): void;
}

export interface KafkaJsInstrumentationConfig extends InstrumentationConfig {
  /** hook for adding custom attributes before producer message is sent */
  producerHook?: KafkaProducerCustomAttributeFunction;

  /** hook for adding custom attributes before consumer message is processed */
  consumerHook?: KafkaConsumerCustomAttributeFunction;
}
