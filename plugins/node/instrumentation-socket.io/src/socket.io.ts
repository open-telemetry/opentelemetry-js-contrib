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
  context,
  trace,
  Span,
  SpanKind,
  SpanStatusCode,
} from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleFile,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import {
  SemanticAttributes,
  MessagingOperationValues,
  MessagingDestinationKindValues,
} from '@opentelemetry/semantic-conventions';
import { SocketIoInstrumentationConfig } from './types';
import { SocketIoInstrumentationAttributes } from './AttributeNames';
import { VERSION } from './version';
import {
  extractRoomsAttributeValue,
  isPromise,
  normalizeConfig,
} from './utils';

const reservedEvents = [
  'connect',
  'connect_error',
  'disconnect',
  'disconnecting',
  'newListener',
  'removeListener',
];

export class SocketIoInstrumentation extends InstrumentationBase {
  protected override _config!: SocketIoInstrumentationConfig;

  constructor(config: SocketIoInstrumentationConfig = {}) {
    super(
      '@opentelemetry/instrumentation-socket.io',
      VERSION,
      normalizeConfig(config)
    );
  }

  protected init() {
    const socketInstrumentation = new InstrumentationNodeModuleFile(
      'socket.io/dist/socket.js',
      ['>=3 <5'],
      (moduleExports, moduleVersion) => {
        if (moduleExports === undefined || moduleExports === null) {
          return moduleExports;
        }
        if (moduleVersion === undefined) {
          return moduleExports;
        }
        this._diag.debug(`applying patch to socket.io@${moduleVersion} Socket`);
        if (isWrapped(moduleExports?.Socket?.prototype?.on)) {
          this._unwrap(moduleExports.Socket.prototype, 'on');
        }
        this._wrap(
          moduleExports.Socket.prototype,
          'on',
          this._patchOn(moduleVersion)
        );
        if (isWrapped(moduleExports?.Socket?.prototype?.emit)) {
          this._unwrap(moduleExports.Socket.prototype, 'emit');
        }
        this._wrap(
          moduleExports.Socket.prototype,
          'emit',
          this._patchEmit(moduleVersion)
        );
        return moduleExports;
      },
      moduleExports => {
        if (isWrapped(moduleExports?.Socket?.prototype?.on)) {
          this._unwrap(moduleExports.Socket.prototype, 'on');
        }
        if (isWrapped(moduleExports?.Socket?.prototype?.emit)) {
          this._unwrap(moduleExports.Socket.prototype, 'emit');
        }
        return moduleExports;
      }
    );

    const broadcastOperatorInstrumentation = new InstrumentationNodeModuleFile(
      'socket.io/dist/broadcast-operator.js',
      ['>=4 <5'],
      (moduleExports, moduleVersion) => {
        if (moduleExports === undefined || moduleExports === null) {
          return moduleExports;
        }
        if (moduleVersion === undefined) {
          return moduleExports;
        }
        this._diag.debug(
          `applying patch to socket.io@${moduleVersion} StrictEventEmitter`
        );
        if (isWrapped(moduleExports?.BroadcastOperator?.prototype?.emit)) {
          this._unwrap(moduleExports.BroadcastOperator.prototype, 'emit');
        }
        this._wrap(
          moduleExports.BroadcastOperator.prototype,
          'emit',
          this._patchEmit(moduleVersion)
        );
        return moduleExports;
      },
      moduleExports => {
        if (isWrapped(moduleExports?.BroadcastOperator?.prototype?.emit)) {
          this._unwrap(moduleExports.BroadcastOperator.prototype, 'emit');
        }
        return moduleExports;
      }
    );
    const namespaceInstrumentation = new InstrumentationNodeModuleFile(
      'socket.io/dist/namespace.js',
      ['<4'],
      (moduleExports, moduleVersion) => {
        if (moduleExports === undefined || moduleExports === null) {
          return moduleExports;
        }
        if (moduleVersion === undefined) {
          return moduleExports;
        }
        this._diag.debug(
          `applying patch to socket.io@${moduleVersion} Namespace`
        );
        if (isWrapped(moduleExports?.Namespace?.prototype?.emit)) {
          this._unwrap(moduleExports.Namespace.prototype, 'emit');
        }
        this._wrap(
          moduleExports.Namespace.prototype,
          'emit',
          this._patchEmit(moduleVersion)
        );
        return moduleExports;
      },
      moduleExports => {
        if (isWrapped(moduleExports?.Namespace?.prototype?.emit)) {
          this._unwrap(moduleExports.Namespace.prototype, 'emit');
        }
      }
    );
    const socketInstrumentationLegacy = new InstrumentationNodeModuleFile(
      'socket.io/lib/socket.js',
      ['2'],
      (moduleExports, moduleVersion) => {
        if (moduleExports === undefined || moduleExports === null) {
          return moduleExports;
        }
        if (moduleVersion === undefined) {
          return moduleExports;
        }
        this._diag.debug(`applying patch to socket.io@${moduleVersion} Socket`);
        if (isWrapped(moduleExports.prototype?.on)) {
          this._unwrap(moduleExports.prototype, 'on');
        }
        this._wrap(moduleExports.prototype, 'on', this._patchOn(moduleVersion));
        if (isWrapped(moduleExports.prototype?.emit)) {
          this._unwrap(moduleExports.prototype, 'emit');
        }
        this._wrap(
          moduleExports.prototype,
          'emit',
          this._patchEmit(moduleVersion)
        );
        return moduleExports;
      },
      moduleExports => {
        if (isWrapped(moduleExports.prototype?.on)) {
          this._unwrap(moduleExports.prototype, 'on');
        }
        if (isWrapped(moduleExports.prototype?.emit)) {
          this._unwrap(moduleExports.prototype, 'emit');
        }
        return moduleExports;
      }
    );
    const namespaceInstrumentationLegacy = new InstrumentationNodeModuleFile(
      'socket.io/lib/namespace.js',
      ['2'],
      (moduleExports, moduleVersion) => {
        if (moduleExports === undefined || moduleExports === null) {
          return moduleExports;
        }
        if (moduleVersion === undefined) {
          return moduleExports;
        }
        this._diag.debug(
          `applying patch to socket.io@${moduleVersion} Namespace`
        );
        if (isWrapped(moduleExports?.prototype?.emit)) {
          this._unwrap(moduleExports.prototype, 'emit');
        }
        this._wrap(
          moduleExports.prototype,
          'emit',
          this._patchEmit(moduleVersion)
        );
        return moduleExports;
      },
      moduleExports => {
        if (isWrapped(moduleExports?.prototype?.emit)) {
          this._unwrap(moduleExports.prototype, 'emit');
        }
      }
    );

    return [
      new InstrumentationNodeModuleDefinition(
        'socket.io',
        ['>=3 <5'],
        (moduleExports, moduleVersion) => {
          if (moduleExports === undefined || moduleExports === null) {
            return moduleExports;
          }
          if (moduleVersion === undefined) {
            return moduleExports;
          }
          this._diag.debug(
            `applying patch to socket.io@${moduleVersion} Server`
          );
          if (isWrapped(moduleExports?.Server?.prototype?.on)) {
            this._unwrap(moduleExports.Server.prototype, 'on');
          }
          this._wrap(
            moduleExports.Server.prototype,
            'on',
            this._patchOn(moduleVersion)
          );
          return moduleExports;
        },
        (moduleExports, moduleVersion) => {
          if (isWrapped(moduleExports?.Server?.prototype?.on)) {
            this._unwrap(moduleExports.Server.prototype, 'on');
          }
          return moduleExports;
        },
        [
          broadcastOperatorInstrumentation,
          namespaceInstrumentation,
          socketInstrumentation,
        ]
      ),
      new InstrumentationNodeModuleDefinition(
        'socket.io',
        ['2'],
        (moduleExports, moduleVersion) => {
          if (moduleExports === undefined || moduleExports === null) {
            return moduleExports;
          }
          if (moduleVersion === undefined) {
            return moduleExports;
          }
          this._diag.debug(
            `applying patch to socket.io@${moduleVersion} Server`
          );
          if (isWrapped(moduleExports?.prototype?.on)) {
            this._unwrap(moduleExports.prototype, 'on');
          }
          this._wrap(
            moduleExports.prototype,
            'on',
            this._patchOn(moduleVersion)
          );
          return moduleExports;
        },
        (moduleExports, moduleVersion) => {
          if (isWrapped(moduleExports?.prototype?.on)) {
            this._unwrap(moduleExports.prototype, 'on');
          }
          return moduleExports;
        },
        [namespaceInstrumentationLegacy, socketInstrumentationLegacy]
      ),
    ];
  }

  override setConfig(config: SocketIoInstrumentationConfig = {}) {
    return super.setConfig(normalizeConfig(config));
  }

  private _patchOn(moduleVersion: string) {
    const self = this;
    return (original: Function) => {
      return function (this: any, ev: any, originalListener: Function) {
        if (!self._config.traceReserved && reservedEvents.includes(ev)) {
          return original.apply(this, arguments);
        }
        if (self._config.onIgnoreEventList?.includes(ev)) {
          return original.apply(this, arguments);
        }
        const wrappedListener = function (this: any, ...args: any[]) {
          const eventName = ev;
          const defaultNamespace = '/';
          const namespace = this.name || this.adapter?.nsp?.name;
          const destination =
            namespace === defaultNamespace
              ? eventName
              : `${namespace} ${eventName}`;
          const span: Span = self.tracer.startSpan(
            `${destination} ${MessagingOperationValues.RECEIVE}`,
            {
              kind: SpanKind.CONSUMER,
              attributes: {
                [SemanticAttributes.MESSAGING_SYSTEM]: 'socket.io',
                [SemanticAttributes.MESSAGING_DESTINATION]: namespace,
                [SemanticAttributes.MESSAGING_OPERATION]:
                  MessagingOperationValues.RECEIVE,
                [SocketIoInstrumentationAttributes.SOCKET_IO_EVENT_NAME]:
                  eventName,
              },
            }
          );

          if (self._config.onHook) {
            safeExecuteInTheMiddle(
              () =>
                self._config?.onHook?.(span, { moduleVersion, payload: args }),
              e => {
                if (e) self._diag.error('onHook error', e);
              },
              true
            );
          }
          return context.with(trace.setSpan(context.active(), span), () =>
            self.endSpan(() => originalListener.apply(this, arguments), span)
          );
        };
        return original.apply(this, [ev, wrappedListener]);
      };
    };
  }

  private endSpan(traced: () => any | Promise<any>, span: Span) {
    try {
      const result = traced();
      if (isPromise(result)) {
        return result.then(
          value => {
            span.end();
            return value;
          },
          err => {
            span.recordException(err);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err?.message,
            });
            span.end();
            throw err;
          }
        );
      } else {
        span.end();
        return result;
      }
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
      span.end();
      throw error;
    }
  }

  private _patchEmit(moduleVersion: string) {
    const self = this;
    return (original: Function) => {
      return function (this: any, ev: any, ...args: any[]) {
        if (!self._config.traceReserved && reservedEvents.includes(ev)) {
          return original.apply(this, arguments);
        }
        if (self._config?.emitIgnoreEventList?.includes(ev)) {
          return original.apply(this, arguments);
        }
        const messagingSystem = 'socket.io';
        const eventName = ev;
        const attributes: any = {
          [SemanticAttributes.MESSAGING_SYSTEM]: messagingSystem,
          [SemanticAttributes.MESSAGING_DESTINATION_KIND]:
            MessagingDestinationKindValues.TOPIC,
          [SocketIoInstrumentationAttributes.SOCKET_IO_EVENT_NAME]: eventName,
        };

        const rooms = extractRoomsAttributeValue(this);
        if (rooms.length) {
          attributes[SocketIoInstrumentationAttributes.SOCKET_IO_ROOMS] = rooms;
        }
        const namespace =
          this.name || this.adapter?.nsp?.name || this.sockets?.name;
        if (namespace) {
          attributes[SocketIoInstrumentationAttributes.SOCKET_IO_NAMESPACE] =
            namespace;
          attributes[SemanticAttributes.MESSAGING_DESTINATION] = namespace;
        }
        const spanRooms = rooms.length ? `[${rooms.join()}]` : '';
        const span = self.tracer.startSpan(`${namespace}${spanRooms} send`, {
          kind: SpanKind.PRODUCER,
          attributes,
        });

        if (self._config.emitHook) {
          safeExecuteInTheMiddle(
            () =>
              self._config.emitHook?.(span, { moduleVersion, payload: args }),
            e => {
              if (e) self._diag.error('emitHook error', e);
            },
            true
          );
        }
        try {
          return context.with(trace.setSpan(context.active(), span), () =>
            original.apply(this, arguments)
          );
        } catch (error: any) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          throw error;
        } finally {
          span.end();
        }
      };
    };
  }
}
