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

import { diag, Tracer, Span, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { GeneralAttribute } from '@opentelemetry/semantic-conventions';
import {
  ConnectCallback,
  Net,
  NetInstrumentationConfig,
} from './types';
import { VERSION } from './version';
import { platform } from 'os';
import { Socket, TcpSocketConnectOpts, IpcSocketConnectOpts } from 'net';

const IPC_TRANSPORT = platform() == 'win32' ? 'pipe' : 'Unix';

export class NetInstrumentation extends InstrumentationBase<Net> {
  constructor(protected _config: NetInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-net', VERSION, _config);
  }

  init(): InstrumentationNodeModuleDefinition<Net>[] {
    return [
      new InstrumentationNodeModuleDefinition<Net>(
        'net',
        ['*'],
        moduleExports => {
          diag.debug('Applying patch for net module');
          if (isWrapped(moduleExports.Socket.prototype.connect)) {
            this._unwrap(moduleExports.Socket.prototype.connect, 'connect');
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this._wrap(moduleExports.Socket.prototype, 'connect', this._getPatchedConnect() as any);
          return moduleExports;
        },
        moduleExports => {
          if (moduleExports === undefined) return;
          diag.debug('Removing patch from net module');
          this._unwrap(moduleExports.Socket.prototype, 'connect');
        }
      ),
    ];
  }

  private _getPatchedConnect() {
    return (original: (...args: unknown[]) => void) => {
      const plugin = this;
      return function patchedConnect(
        ...args: unknown[]
      ) {
        const options = normalizedArgs(args);

        if (!options) {
          startGenericSpan(plugin, this);
          return original.apply(this, args);
        }

        const span = options.path ? startIpcSpan(plugin, options, this) : startTcpSpan(plugin, options, this);
        
        return safeExecuteInTheMiddle(
          () => original.apply(this, [...args]),
          error => {
            if (error !== undefined) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message,
              });
              span.end();
            }
          }
        );

      };
    };
  }
}

function normalizedArgs(args: unknown[]): TcpSocketConnectOpts | IpcSocketConnectOpts | undefined {
  if (!args[0]) {
    return;
  }

  switch (typeof args[0]) {
    case 'number':
      return {
        port: args[0],
        host: typeof args[1] === 'string' ? args[1] : 'localhost',
      };
    case 'object':
      if (Array.isArray(args[0])) {
        return normalizedArgs(args[0]);
      }
      return args[0];
    case 'string':
      return {
        path: args[0],
      };
  }
}

const SOCKET_EVENTS = ['connect', 'error', 'close', 'timeout'];

function spanEndHandler(span: Span) {
  return () => {
    span.end();
  };
}

function spanErrorHandler(span: Span) {
  return (e: Error) => {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: e.message,
    });
  };
}

function registerListeners(socket: Socket, span: Span) {
  const setSpanError = spanErrorHandler(span);
  const onEnd = spanEndHandler(span);

  socket.once('error', setSpanError);

  const removeListeners = () => {
    socket.removeListener('error', setSpanError);
    for (const event of SOCKET_EVENTS) {
      socket.removeListener(event, onEnd);
      socket.removeListener(event, removeListeners);
    }
  };

  for (const event of SOCKET_EVENTS) {
    socket.once(event, onEnd);
    socket.once(event, removeListeners);
  }
}

/* It might still be useful to pick up errors due to invalid connect arguments. */
function startGenericSpan(plugin: NetInstrumentation, socket: Socket) {
  const span = plugin.tracer.startSpan('connect', {
    kind: SpanKind.CLIENT,
  });
  registerListeners(socket, span);
}

function startIpcSpan(plugin: NetInstrumentation, options: IpcNetConnectOpts, socket: Socket) {
  const span = plugin.tracer.startSpan('ipc.connect', {
    kind: SpanKind.CLIENT,
    attributes: {
      [GeneralAttribute.NET_TRANSPORT]: IPC_TRANSPORT,
      [GeneralAttribute.NET_PEER_NAME]: options.path,
    },
  });

  registerListeners(socket, span); 

  return span;
}

function startTcpSpan(plugin: NetInstrumentation, options: TcpSocketConnectOpts, socket: Socket) {
  const span = plugin.tracer.startSpan('tcp.connect', {
    kind: SpanKind.CLIENT,
    attributes: {
      [GeneralAttribute.NET_TRANSPORT]: 'IP.TCP',
      [GeneralAttribute.NET_PEER_NAME]: options.host,
      [GeneralAttribute.NET_PEER_PORT]: options.port,
    },
  });

  const addHostAttributes = () => {
    span.setAttributes({
      [GeneralAttribute.NET_PEER_IP]: socket.remoteAddress,
      [GeneralAttribute.NET_HOST_IP]: socket.localAddress,
      [GeneralAttribute.NET_HOST_PORT]: socket.localPort,
    });
  };

  const onError = spanEndHandler(span);
  const onEnd = spanEndHandler(span);

  const removeListeners = () => {
    socket.removeListener('connect', addHostAttributes);
    socket.removeListener('error', onError);
    for (const event of SOCKET_EVENTS) {
      socket.removeListener(event, onEnd);
      socket.removeListener(event, removeListeners);
    }
  };

  socket.once('connect', addHostAttributes);

  for (const event of SOCKET_EVENTS) {
    socket.once(event, onEnd);
    socket.once(event, removeListeners);
  }

  return span;
}
