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
import { SocketIoInstrumentationConfig } from './types';

export const isPromise = (value: any): value is Promise<unknown> => {
  return typeof value?.then === 'function';
};

export const normalizeConfig = (config?: SocketIoInstrumentationConfig) => {
  config = Object.assign({}, config);
  if (!Array.isArray(config.emitIgnoreEventList)) {
    config.emitIgnoreEventList = [];
  }
  if (!Array.isArray(config.onIgnoreEventList)) {
    config.onIgnoreEventList = [];
  }
  return config;
};

export const extractRoomsAttributeValue = (self: any): any[] => {
  let rooms =
    self.rooms ||
    self._rooms ||
    self.sockets?._rooms ||
    self.sockets?.rooms ||
    [];
  // Some of the attributes above are of Set type. Convert it.
  if (!Array.isArray(rooms)) {
    rooms = Array.from<string>(rooms);
  }
  // only for v2: this.id is only set for v2. That's to mimic later versions which have this.id in the rooms Set.
  if (rooms.length === 0 && self.id) {
    rooms.push(self.id);
  }
  return rooms;
};
