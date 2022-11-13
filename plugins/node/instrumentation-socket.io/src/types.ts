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
import type * as io from 'socket.io';
import type { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

export const defaultSocketIoPath = '/socket.io/';

export const SocketIoInstrumentationAttributes = {
    SOCKET_IO_ROOMS: 'messaging.socket.io.rooms',
    SOCKET_IO_NAMESPACE: 'messaging.socket.io.namespace',
    SOCKET_IO_EVENT_NAME: 'messaging.socket.io.event_name',
};
export interface SocketIoHookInfo {
    moduleVersion?: string;
    payload: any[];
}
export interface SocketIoHookFunction {
    (span: Span, hookInfo: SocketIoHookInfo): void;
}

export interface HttpTransportInstrumentationConfig {
    /** Set to the instance of `HttpInstrumentation` used for http instrumentation */
    httpInstrumentation: HttpInstrumentation;
    /** Set to the path of socket.io endpoint Desalts to `/socket.io/` */
    socketPath?: string;
}
export interface SocketIoInstrumentationConfig extends InstrumentationConfig {
    /** Hook for adding custom attributes before socket.io emits the event */
    emitHook?: SocketIoHookFunction;
    /** list of events to ignore tracing on for socket.io emits */
    emitIgnoreEventList?: string[];
    /** Hook for adding custom attributes before the event listener (callback) is invoked */
    onHook?: SocketIoHookFunction;
    /** list of events to ignore tracing on for socket.io listeners */
    onIgnoreEventList?: string[];
    /** Set to `true` if you want to trace socket.io reserved events (see https://socket.io/docs/v4/emit-cheatsheet/#Reserved-events) */
    traceReserved?: boolean;
    /** Set to `TransportInstrumentationConfig` if you want to filter out socket.io HTTP transport  */
    filterHttpTransport?: HttpTransportInstrumentationConfig;
}
export type Io = typeof io;
