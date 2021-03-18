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

import {
  diag,
  Tracer,
  Span,
  SpanKind,
  SpanStatusCode,
} from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { GeneralAttribute } from '@opentelemetry/semantic-conventions';
import { Net } from './types';
import { VERSION } from './version';
import { platform } from 'os';
import { Socket } from 'net';

const IPC_TRANSPORT = platform() == 'win32' ? 'pipe' : 'Unix';

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
        const options = normalizedArgs(args);

        const span = options
          ? options.path
            ? startIpcSpan(plugin.tracer, options, this)
            : startTcpSpan(plugin.tracer, options, this)
          : startGenericSpan(plugin.tracer, this);

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
}

interface NormalizedOptions {
  host?: string;
  port?: number;
  path?: string;
}

function normalizedArgs(args: unknown[]): NormalizedOptions | null | undefined {
  const opt = args[0];
  if (!opt) {
    return;
  }

  switch (typeof opt) {
    case 'number':
      return {
        port: opt,
        host: typeof args[1] === 'string' ? args[1] : 'localhost',
      };
    case 'object':
      if (Array.isArray(opt)) {
        return normalizedArgs(opt);
      }
      return opt;
    case 'string':
      return {
        path: opt,
      };
    default:
      return;
  }
}

const SOCKET_EVENTS = ['connect', 'error', 'close'];

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

interface ListenerOpts {
  hostAttributes?: boolean;
}

function registerListeners(
  socket: Socket,
  span: Span,
  { hostAttributes = false }: ListenerOpts = {}
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

  socket.once('error', setSpanError);

  if (hostAttributes) {
    socket.once('connect', setHostAttributes);
  }

  const removeListeners = () => {
    socket.removeListener('error', setSpanError);
    socket.removeListener('connect', setHostAttributes);
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

/* It might still be useful to pick up errors due to invalid connect arguments. */
function startGenericSpan(tracer: Tracer, socket: Socket) {
  const span = tracer.startSpan('connect', {
    kind: SpanKind.CLIENT,
  });

  registerListeners(socket, span);

  return span;
}

function startIpcSpan(
  tracer: Tracer,
  options: NormalizedOptions,
  socket: Socket
) {
  const span = tracer.startSpan('ipc.connect', {
    kind: SpanKind.CLIENT,
    attributes: {
      [GeneralAttribute.NET_TRANSPORT]: IPC_TRANSPORT,
      [GeneralAttribute.NET_PEER_NAME]: options.path,
    },
  });

  registerListeners(socket, span);

  return span;
}

function startTcpSpan(
  tracer: Tracer,
  options: NormalizedOptions,
  socket: Socket
) {
  const span = tracer.startSpan('tcp.connect', {
    kind: SpanKind.CLIENT,
    attributes: {
      [GeneralAttribute.NET_TRANSPORT]: 'IP.TCP',
      [GeneralAttribute.NET_PEER_NAME]: options.host,
      [GeneralAttribute.NET_PEER_PORT]: options.port,
    },
  });

  registerListeners(socket, span, { hostAttributes: true });

  return span;
}
