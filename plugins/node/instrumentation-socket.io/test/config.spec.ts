import { defaultSocketIoPath, SocketIoInstrumentation, SocketIoInstrumentationConfig } from '../src';
import { HttpInstrumentation, HttpInstrumentationConfig } from '@opentelemetry/instrumentation-http';
import expect from 'expect';

describe('SocketIoInstrumentationConfig', () => {
    describe('filterHttpTransport', () => {
        it('add default socket.io path to HttpInstrumentationConfig.ignoreIncomingPaths', () => {
            const httpInstrumentation = new HttpInstrumentation();
            const socketIoInstrumentation = new SocketIoInstrumentation({
                filterHttpTransport: {
                    httpInstrumentation,
                },
            });

            const httpInstrumentationConfig = httpInstrumentation.getConfig() as HttpInstrumentationConfig;
            expect(httpInstrumentationConfig.ignoreIncomingPaths).toContain(defaultSocketIoPath);
        });

        it('add custom socket.io path to HttpInstrumentationConfig.ignoreIncomingPaths', () => {
            const path = '/test';
            const httpInstrumentation = new HttpInstrumentation();
            const socketIoInstrumentation = new SocketIoInstrumentation({
                filterHttpTransport: {
                    httpInstrumentation,
                    socketPath: path,
                },
            });

            const httpInstrumentationConfig = httpInstrumentation.getConfig() as HttpInstrumentationConfig;
            expect(httpInstrumentationConfig.ignoreIncomingPaths).toContain(path);
        });
    });

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
