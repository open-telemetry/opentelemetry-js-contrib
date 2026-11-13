/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from 'expect';
import { traceSerializer } from '../src/utils';

describe('traceSerializer', () => {
  it('should return the same object', () => {
    const object = {
      id: 'trace.id',
      runId: 'run-1',
      path: 'my-string-path',
    };

    const serializer = traceSerializer({});
    expect(JSON.parse(serializer(object))).toEqual(object);
  });

  it('should remove default ignored keys and underscore-prefixed keys', () => {
    const object = {
      id: 'trace.id',
      runId: 'run-1',
      path: 'my-string-path',
      emitter: {
        emit: () => {},
      },
      meta: {
        traceId: 'abcd',
        tokens: ['my-secret-token'],
        createdBy: {
          id: 5,
        },
      },
      logger: {
        log: () => 'test',
      },
      _privateBoolean: true,
      createdBy: {
        id: 5,
      },
      client: {
        name: 'temp',
      },
      _privateNumber: 335,
    };

    const serializer = traceSerializer({});
    expect(JSON.parse(serializer(object))).toEqual({
      id: 'trace.id',
      runId: 'run-1',
      path: 'my-string-path',
      meta: {
        traceId: 'abcd',
      },
    });
  });

  it('should remove custom defined ignored_keys', () => {
    const object = {
      id: 'trace.id',
      runId: 'run-1',
      path: 'my-string-path',
    };

    const serializer = traceSerializer({ ignored_keys: ['runId', 'path'] });
    expect(JSON.parse(serializer(object))).toEqual({ id: 'trace.id' });
  });

  it('should remove both default and custom keys', () => {
    const object = {
      id: 'trace.id',
      runId: 'run-1',
      path: 'my-string-path',
      logger: {
        log: () => 'test',
      },
      _privateBoolean: true,
    };

    const serializer = traceSerializer({ ignored_keys: ['path'] });
    expect(JSON.parse(serializer(object))).toEqual({
      id: 'trace.id',
      runId: 'run-1',
    });
  });

  it('should remove keys in each object in an Array', () => {
    const spans = [
      {
        id: 'trace.id',
        runId: 'run-1',
        path: 'my-string-path',
        emitter: {
          emit: () => {},
        },
      },
      {
        id: 'trace.id',
        runId: 'run-1',
        path: 'my-string-path',
        _privateBoolean: true,
        data: {
          prompt: 'super prompt',
          special: {
            modelId: 'eq-12',
            createdBy: {
              id: 5,
            },
          },
        },
      },
    ];
    const serializer = traceSerializer({});
    expect(JSON.parse(serializer(spans))).toEqual([
      {
        id: 'trace.id',
        runId: 'run-1',
        path: 'my-string-path',
      },
      {
        id: 'trace.id',
        runId: 'run-1',
        path: 'my-string-path',
        data: {
          prompt: 'super prompt',
          special: {
            modelId: 'eq-12',
          },
        },
      },
    ]);
  });
});
