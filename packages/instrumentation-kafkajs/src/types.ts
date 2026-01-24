/*
 * Copyright The OpenTelemetry Authors, Aspecto
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

export interface KafkajsMessage {
  key?: Buffer | string | null;
  value: Buffer | string | null;
  partition?: number;
  headers?: Record<string, Buffer | string | (Buffer | string)[] | undefined>;
  timestamp?: string;
}

export interface MessageInfo<T = KafkajsMessage> {
  topic: string;
  message: T;
}

export interface KafkaProducerCustomAttributeFunction<T = KafkajsMessage> {
  (span: Span, info: MessageInfo<T>): void;
}

export interface KafkaConsumerCustomAttributeFunction<T = KafkajsMessage> {
  (span: Span, info: MessageInfo<T>): void;
}

export interface KafkaJsInstrumentationConfig extends InstrumentationConfig {
  /** hook for adding custom attributes before producer message is sent */
  producerHook?: KafkaProducerCustomAttributeFunction;

  /** hook for adding custom attributes before consumer message is processed */
  consumerHook?: KafkaConsumerCustomAttributeFunction;
}
