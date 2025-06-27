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
import { SocketIoInstrumentation, SocketIoInstrumentationConfig } from '../src';
import * as expect from 'expect';

describe('SocketIoInstrumentationConfig', () => {
  it('forces *IgnoreEventList to be an Array', () => {
    const socketIoInstrumentation = new SocketIoInstrumentation({
      onIgnoreEventList: {} as any,
      emitIgnoreEventList: 1 as any,
    });

    const { onIgnoreEventList, emitIgnoreEventList } =
      socketIoInstrumentation.getConfig() as SocketIoInstrumentationConfig;

    expect(Array.isArray(onIgnoreEventList)).toEqual(true);
    expect(Array.isArray(emitIgnoreEventList)).toEqual(true);
  });
});
