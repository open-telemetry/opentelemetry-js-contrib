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

import { diag, Span, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { GeneralAttribute } from '@opentelemetry/semantic-conventions';
import { Net, NormalizedOptions, SocketEvent } from './types';
import { getNormalizedArgs, IPC_TRANSPORT } from './utils';
import { VERSION } from './version';
import { Socket } from 'net';

export class NetInstrumentation extends InstrumentationBase<Net> {
  constructor(protected _config: InstrumentationConfig = {}) {
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
            this._unwrap(moduleExports.Socket.prototype, 'connect');
          }
          this._wrap(
            moduleExports.Socket.prototype,
            'connect',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this._getPatchedConnect() as any
          );
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
      return function patchedConnect(this: Socket, ...args: unknown[]) {
        const options = getNormalizedArgs(args);

        const span = options
          ? options.path
            ? plugin._startIpcSpan(options, this)
            : plugin._startTcpSpan(options, this)
          : plugin._startGenericSpan(this);

        return safeExecuteInTheMiddle(
          () => original.apply(this, args),
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

  /* It might still be useful to pick up errors due to invalid connect arguments. */
  private _startGenericSpan(socket: Socket) {
    const span = this.tracer.startSpan('connect', {
      kind: SpanKind.CLIENT,
    });

    registerListeners(socket, span);

    return span;
  }

  private _startIpcSpan(options: NormalizedOptions, socket: Socket) {
    const span = this.tracer.startSpan('ipc.connect', {
      kind: SpanKind.CLIENT,
      attributes: {
        [GeneralAttribute.NET_TRANSPORT]: IPC_TRANSPORT,
        [GeneralAttribute.NET_PEER_NAME]: options.path,
      },
    });

    registerListeners(socket, span);

    return span;
  }

  private _startTcpSpan(options: NormalizedOptions, socket: Socket) {
    const span = this.tracer.startSpan('tcp.connect', {
      kind: SpanKind.CLIENT,
      attributes: {
        [GeneralAttribute.NET_TRANSPORT]: GeneralAttribute.IP_TCP,
        [GeneralAttribute.NET_PEER_NAME]: options.host,
        [GeneralAttribute.NET_PEER_PORT]: options.port,
      },
    });

    registerListeners(socket, span, { hostAttributes: true });

    return span;
  }
}

const SOCKET_EVENTS = [
  SocketEvent.CLOSE,
  SocketEvent.CONNECT,
  SocketEvent.ERROR,
];

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

function registerListeners(
  socket: Socket,
  span: Span,
  { hostAttributes = false }: { hostAttributes?: boolean } = {}
) {
  const setSpanError = spanErrorHandler(span);
  const setSpanEnd = spanEndHandler(span);

  const setHostAttributes = () => {
    span.setAttributes({
      [GeneralAttribute.NET_PEER_IP]: socket.remoteAddress,
      [GeneralAttribute.NET_HOST_IP]: socket.localAddress,
      [GeneralAttribute.NET_HOST_PORT]: socket.localPort,
    });
  };

  socket.once(SocketEvent.ERROR, setSpanError);

  if (hostAttributes) {
    socket.once(SocketEvent.CONNECT, setHostAttributes);
  }

  const removeListeners = () => {
    socket.removeListener(SocketEvent.ERROR, setSpanError);
    socket.removeListener(SocketEvent.CONNECT, setHostAttributes);
    for (const event of SOCKET_EVENTS) {
      socket.removeListener(event, setSpanEnd);
      socket.removeListener(event, removeListeners);
    }
  };

  for (const event of SOCKET_EVENTS) {
    socket.once(event, setSpanEnd);
    socket.once(event, removeListeners);
  }
}
