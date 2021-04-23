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

import { diag, Span, SpanStatusCode } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { TLS, TLSSocketEvent } from './types';
import { VERSION } from './version';
import { TLSSocket } from 'tls';

export class TLSInstrumentation extends InstrumentationBase<TLS> {
  constructor(protected _config: InstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-tls', VERSION, _config);
  }

  init(): InstrumentationNodeModuleDefinition<TLS>[] {
    return [
      new InstrumentationNodeModuleDefinition<TLS>(
        'tls',
        ['*'],
        moduleExports => {
          diag.debug('Applying patch for tls module');
          let netPatchedConnect;
          if (isWrapped(moduleExports.TLSSocket.prototype.connect)) {
            // If NetInstrumentation was applied already, we unwrap
            // the connect method and save the "patchedConnect" for later
            // use (see _getPatchedConnect)
            if (
              moduleExports.TLSSocket.prototype.connect.name ===
              'patchedConnect'
            ) {
              netPatchedConnect = moduleExports.TLSSocket.prototype.connect;
            }
            this._unwrap(moduleExports.TLSSocket.prototype, 'connect');
          }
          this._wrap(
            moduleExports.TLSSocket.prototype,
            'connect',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this._getPatchedConnect(netPatchedConnect) as any
          );
          return moduleExports;
        },
        moduleExports => {
          if (moduleExports === undefined) return;
          diag.debug('Removing patch from net module');
          this._unwrap(moduleExports.TLSSocket.prototype, 'connect');
        }
      ),
    ];
  }

  private _getPatchedConnect(netPatchedConnect: any) {
    return (original: (...args: unknown[]) => void) => {
      const plugin = this;
      return function patchedTLSConnect(this: TLSSocket, ...args: unknown[]) {
        const span = plugin._startTLSSpan(this);

        return safeExecuteInTheMiddle(
          () =>
            netPatchedConnect
              ? netPatchedConnect.apply(this, args)
              : original.apply(this, args),
          error => {
            if (error !== undefined) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message,
              });
              span.recordException(error);
              span.end();
            }
          }
        );
      };
    };
  }

  /* It might still be useful to pick up errors due to invalid connect arguments. */
  private _startTLSSpan(socket: TLSSocket) {
    const span = this.tracer.startSpan('tls.connect');

    registerListeners(socket, span);

    return span;
  }
}

const SOCKET_EVENTS = [
  TLSSocketEvent.SECURE_CONNECT,
  TLSSocketEvent.TLS_CLIENT_ERROR,
];

function spanEndHandler(socket: TLSSocket, span: Span) {
  return () => {
    const peerCertificate = socket.getPeerCertificate(true);
    const cipher = socket.getCipher();
    const protocol = socket.getProtocol();
    const attributes = {
      'tls.protocol': String(protocol),
      'tls.authorized': String(socket.authorized),
      'tls.cipher.name': cipher.name,
      'tls.cipher.standardName': cipher.name,
      'tls.cipher.version': cipher.version,
      'tls.certificate.fingerprint256': peerCertificate.fingerprint256,
      'tls.certificate.serialNumber': peerCertificate.serialNumber,
      'tls.certificate.validFrom': peerCertificate.valid_from,
      'tls.certificate.validTo': peerCertificate.valid_to,
      'tls.alpnProtocol': '',
    };
    if (socket.alpnProtocol) {
      attributes['tls.alpnProtocol'] = socket.alpnProtocol;
    }

    span.setAttributes(attributes);
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

function registerListeners(socket: TLSSocket, span: Span) {
  const setSpanError = spanErrorHandler(span);
  const setSpanEnd = spanEndHandler(socket, span);

  socket.prependOnceListener(TLSSocketEvent.TLS_CLIENT_ERROR, setSpanError);

  const removeListeners = () => {
    socket.removeListener(TLSSocketEvent.TLS_CLIENT_ERROR, setSpanError);
    for (const event of SOCKET_EVENTS) {
      socket.removeListener(event, setSpanEnd);
      socket.removeListener(event, removeListeners);
    }
  };

  for (const event of SOCKET_EVENTS) {
    socket.prependOnceListener(event, () => {
      setSpanEnd();
      removeListeners();
    });
  }
}
