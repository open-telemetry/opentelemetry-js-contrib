import { strict as assert } from 'assert';
import http from 'http';
import { AddressInfo } from 'net';

import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { getTestSpans } from '@opentelemetry/contrib-test-utils';

import expect from 'expect';
import { Server, Socket } from 'socket.io';
import socketIo from 'socket.io';
import * as ioClient from 'socket.io-client';
import * as path from 'path';

export const io = (ioClient.io || (ioClient as any).default) as typeof ioClient.io;
const packageJsonPath = (packageName: string) =>
    path.join(path.dirname(require.resolve(packageName)), '..', 'package.json');
const version = require(packageJsonPath('socket.io')).version;

assert.equal(typeof version, 'string');

export const isV2 = version && /^2\./.test(version);

export const createServer = (callback: (server: Server, port: number) => void) => {
    const server = http.createServer();
    const sio = createServerInstance(server);
    server.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        callback(sio, port);
    });
};

export const createServerInstance = (server?: http.Server) => {
    if (isV2) {
        return (socketIo as any)(server, { serveClient: false });
    }
    return new Server(server);
};

export const getSocketIoSpans = (): ReadableSpan[] =>
    getTestSpans().filter((s) => s.attributes[SemanticAttributes.MESSAGING_SYSTEM] === 'socket.io') as ReadableSpan[];

export const expectSpan = (spanName: string, callback?: (span: ReadableSpan) => void, spanCount?: number) => {
    const spans = getSocketIoSpans();
    expect(spans.length).toEqual(spanCount || 1);
    const span = spans.find((s) => s.name === spanName);
    expect(span).toBeDefined();
    callback(span);
};
