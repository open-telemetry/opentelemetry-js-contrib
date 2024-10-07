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
  MESSAGINGDESTINATIONKINDVALUES_TOPIC,
  SEMATTRS_MESSAGING_DESTINATION,
  SEMATTRS_MESSAGING_DESTINATION_KIND,
  SEMATTRS_MESSAGING_SYSTEM,
} from '@opentelemetry/semantic-conventions';
import {
  SocketIoInstrumentation,
  SocketIoInstrumentationAttributes,
  SocketIoInstrumentationConfig,
} from '../src';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import * as expect from 'expect';
import 'mocha';
import { registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';

const instrumentation = registerInstrumentationTesting(
  new SocketIoInstrumentation()
);
import { Socket } from 'socket.io';
import {
  createServer,
  createServerInstance,
  io,
  getSocketIoSpans,
  expectSpan,
  isV2,
} from './utils';

describe('SocketIoInstrumentation', () => {
  beforeEach(() => {
    instrumentation.enable();
    instrumentation.setConfig({});
  });

  afterEach(() => {
    instrumentation.disable();
  });

  describe('Server', () => {
    it('emit is instrumented', () => {
      const io = createServerInstance();
      io.emit('test');
      expectSpan('/ send', span => {
        expect(span.kind).toEqual(SpanKind.PRODUCER);
        expect(span.attributes[SEMATTRS_MESSAGING_SYSTEM]).toEqual('socket.io');
        expect(span.attributes[SEMATTRS_MESSAGING_DESTINATION_KIND]).toEqual(
          MESSAGINGDESTINATIONKINDVALUES_TOPIC
        );
      });
    });

    it('emitIgnoreEventList events are ignored', () => {
      const io = createServerInstance();
      const config: SocketIoInstrumentationConfig = {
        emitIgnoreEventList: ['ignored'],
      };
      instrumentation.setConfig(config);
      io.emit('test');
      io.emit('ignored');
      expect(getSocketIoSpans().length).toEqual(1);
    });

    it('emit reserved events error is instrumented', () => {
      const config: SocketIoInstrumentationConfig = {
        traceReserved: true,
      };
      instrumentation.setConfig(config);
      const io = createServerInstance();
      try {
        io.emit('connect');
      } catch (error) {}
      if (isV2) {
        // only for v2: connect do not throw, but are just ignored
        return expectSpan('/ send', span => {
          expect(span.kind).toEqual(SpanKind.PRODUCER);
          expect(span.attributes[SEMATTRS_MESSAGING_SYSTEM]).toEqual(
            'socket.io'
          );
        });
      }
      expectSpan('/ send', span => {
        expect(span.status.code).toEqual(SpanStatusCode.ERROR);
        expect(span.status.message).toEqual(
          '"connect" is a reserved event name'
        );
      });
    });

    it('send is instrumented', () => {
      const io = createServerInstance();
      io.send('test');
      expectSpan('/ send', span => {
        expect(span.kind).toEqual(SpanKind.PRODUCER);
        expect(span.attributes[SEMATTRS_MESSAGING_SYSTEM]).toEqual('socket.io');
        expect(span.attributes[SEMATTRS_MESSAGING_DESTINATION_KIND]).toEqual(
          MESSAGINGDESTINATIONKINDVALUES_TOPIC
        );
      });
    });

    it('emitHook is called', () => {
      const config: SocketIoInstrumentationConfig = {
        traceReserved: true,
        emitHook: (span, hookInfo) => {
          span.setAttribute('payload', JSON.stringify(hookInfo.payload));
        },
      };
      instrumentation.setConfig(config);

      const io = createServerInstance();
      io.emit('test', 1234);
      expectSpan('/ send', span => {
        expect(span.attributes['payload']).toEqual(JSON.stringify([1234]));
      });
    });

    it('emitHook error does not effect trace', () => {
      const config: SocketIoInstrumentationConfig = {
        emitHook: () => {
          throw new Error('Throwing');
        },
      };
      instrumentation.setConfig(config);
      const io = createServerInstance();
      io.emit('test');
      const spans = getSocketIoSpans();
      expect(spans.length).toBe(1);
    });

    it('onHook is called', done => {
      const config: SocketIoInstrumentationConfig = {
        onHook: (span, hookInfo) => {
          span.setAttribute('payload', JSON.stringify(hookInfo.payload));
        },
        // only for v2: v2 emits connection on the client side, newer versions do not
        emitIgnoreEventList: ['connection'],
      };
      instrumentation.setConfig(config);
      const data = {
        name: 'bob',
        age: 28,
      };
      createServer((sio, port) => {
        const client = io(`http://localhost:${port}`);
        client.on('test', () => client.emit('test_reply', data));
        sio.on('connection', (socket: Socket) => {
          socket.emit('test');
          socket.on('test_reply', data => {
            client.close();
            sio.close();
            //trace is created after the listener method is completed
            setTimeout(() => {
              expectSpan(
                'test_reply receive',
                span => {
                  try {
                    expect(span.kind).toEqual(SpanKind.CONSUMER);
                    expect(span.attributes[SEMATTRS_MESSAGING_SYSTEM]).toEqual(
                      'socket.io'
                    );
                    expect(span.attributes['payload']).toEqual(
                      JSON.stringify([data])
                    );
                    done();
                  } catch (e) {
                    done(e);
                  }
                },
                3
              );
            });
          });
        });
      });
    });

    it('traceReserved:true on is instrumented', done => {
      const config: SocketIoInstrumentationConfig = {
        traceReserved: true,
        // only for v2: v2 emits [dis]connect[ing] events which later versions do not
        emitIgnoreEventList: [
          'disconnect',
          'disconnecting',
          'connection',
          'connect',
        ],
      };
      instrumentation.setConfig(config);
      createServer((sio, port) => {
        const client = io(`http://localhost:${port}`);
        sio.on('connection', () => {
          //trace is created after the listener method is completed
          setTimeout(() => {
            expectSpan('connection receive', span => {
              expect(span.kind).toEqual(SpanKind.CONSUMER);
              expect(span.attributes[SEMATTRS_MESSAGING_SYSTEM]).toEqual(
                'socket.io'
              );
              client.close();
              sio.close();
              done();
            });
          }, 10);
        });
      });
    });

    it('on is instrumented', done => {
      const config: SocketIoInstrumentationConfig = {
        // only for v2: v2 emits connection events which later versions do not
        emitIgnoreEventList: ['connection'],
      };
      instrumentation.setConfig(config);
      createServer((sio, port) => {
        const client = io(`http://localhost:${port}`);
        client.on('test', () => client.emit('test_reply'));
        sio.on('connection', (socket: Socket) => {
          socket.emit('test');
          socket.on('test_reply', () => {
            client.close();
            sio.close();
            //trace is created after the listener method is completed
            setTimeout(() => {
              expectSpan(
                'test_reply receive',
                span => {
                  try {
                    expect(span.kind).toEqual(SpanKind.CONSUMER);
                    expect(span.attributes[SEMATTRS_MESSAGING_SYSTEM]).toEqual(
                      'socket.io'
                    );
                    done();
                  } catch (e) {
                    done(e);
                  }
                },
                3
              );
            });
          });
        });
      });
    });

    it('onIgnoreEventList events are ignored', done => {
      const config: SocketIoInstrumentationConfig = {
        onIgnoreEventList: ['test_reply'],
        // only for v2: v2 emits connection events which later versions do not
        emitIgnoreEventList: ['connection'],
      };
      instrumentation.setConfig(config);
      createServer((sio, port) => {
        const client = io(`http://localhost:${port}`);
        client.on('test', () => client.emit('test_reply'));
        sio.on('connection', (socket: Socket) => {
          socket.emit('test');
          socket.on('test_reply', () => {
            client.close();
            sio.close();
            //trace is created after the listener method is completed
            setTimeout(() => {
              try {
                expect(getSocketIoSpans().length).toEqual(2);
                done();
              } catch (e) {
                done(e);
              }
            });
          });
        });
      });
    });

    it('broadcast is instrumented', () => {
      const roomName = 'room';
      const sio = createServerInstance();
      sio.to(roomName).emit('broadcast', '1234');
      expectSpan('/[room] send', span => {
        expect(span.attributes[SEMATTRS_MESSAGING_DESTINATION]).toEqual('/');
        expect(
          span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_ROOMS]
        ).toEqual([roomName]);
      });
    });

    it('broadcast to multiple rooms', () => {
      const sio = createServerInstance();
      sio.to('room1').to('room2').emit('broadcast', '1234');
      expectSpan('/[room1,room2] send', span => {
        expect(span.attributes[SEMATTRS_MESSAGING_DESTINATION]).toEqual('/');
        expect(
          span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_ROOMS]
        ).toEqual(['room1', 'room2']);
      });
    });
  });

  describe('Namespace', () => {
    it('emit is instrumented', () => {
      const io = createServerInstance();
      const namespace = io.of('/testing');
      namespace.emit('namespace');
      expectSpan('/testing send', span => {
        expect(span.attributes[SEMATTRS_MESSAGING_DESTINATION]).toEqual(
          '/testing'
        );
        expect(
          span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_NAMESPACE]
        ).toEqual('/testing');
      });
    });

    it('broadcast is instrumented', () => {
      const roomName = 'room';
      const io = createServerInstance();
      const namespace = io.of('/testing');
      namespace.to(roomName).emit('broadcast', '1234');
      expectSpan('/testing[room] send', span => {
        expect(span.attributes[SEMATTRS_MESSAGING_DESTINATION]).toEqual(
          '/testing'
        );
        expect(
          span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_ROOMS]
        ).toEqual([roomName]);
        expect(
          span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_NAMESPACE]
        ).toEqual('/testing');
      });
    });

    it('broadcast to multiple rooms', () => {
      const io = createServerInstance();
      const namespace = io.of('/testing');
      namespace.to('room1').to('room2').emit('broadcast', '1234');
      expectSpan('/testing[room1,room2] send', span => {
        expect(span.attributes[SEMATTRS_MESSAGING_DESTINATION]).toEqual(
          '/testing'
        );
        expect(
          span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_NAMESPACE]
        ).toEqual('/testing');
        expect(
          span.attributes[SocketIoInstrumentationAttributes.SOCKET_IO_ROOMS]
        ).toEqual(['room1', 'room2']);
      });
    });

    it('on is instrumented', done => {
      const config: SocketIoInstrumentationConfig = {
        // only for v2: v2 emits connection events which later versions do not
        emitIgnoreEventList: ['connection'],
      };
      instrumentation.setConfig(config);
      createServer((sio, port) => {
        const namespace = sio.of('/testing');
        const client = io(`http://localhost:${port}/testing`);
        client.on('test', () => client.emit('test_reply'));
        namespace.on('connection', (socket: Socket) => {
          socket.emit('test');
          socket.on('test_reply', () => {
            client.close();
            sio.close();
            //trace is created after the listener method is completed
            setTimeout(() => {
              expectSpan(
                '/testing test_reply receive',
                span => {
                  try {
                    expect(span.kind).toEqual(SpanKind.CONSUMER);
                    expect(span.attributes[SEMATTRS_MESSAGING_SYSTEM]).toEqual(
                      'socket.io'
                    );
                    expect(
                      span.attributes[SEMATTRS_MESSAGING_DESTINATION]
                    ).toEqual('/testing');
                    done();
                  } catch (e) {
                    done(e);
                  }
                },
                2
              );
            });
          });
        });
      });
    });
  });

  describe('Socket', () => {
    it('emit is instrumented', done => {
      const config: SocketIoInstrumentationConfig = {
        // only for v2: v2 emits connection events which later versions do not
        emitIgnoreEventList: ['connection'],
      };
      instrumentation.setConfig(config);
      createServer((sio, port) => {
        const client = io(`http://localhost:${port}`, {
          // websockets transport disconnects without the delay of the polling interval
          transports: ['websocket'],
        });
        sio.on('connection', (socket: Socket) => {
          socket.emit('test');
          setTimeout(() => {
            client.close();
            sio.close();
            expectSpan(
              `/[${socket.id}] send`,
              span => {
                try {
                  expect(span.kind).toEqual(SpanKind.PRODUCER);
                  expect(span.attributes[SEMATTRS_MESSAGING_SYSTEM]).toEqual(
                    'socket.io'
                  );
                  done();
                } catch (e) {
                  done(e);
                }
              },
              2
            );
          }, 10);
        });
      });
    });
  });
});
