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
