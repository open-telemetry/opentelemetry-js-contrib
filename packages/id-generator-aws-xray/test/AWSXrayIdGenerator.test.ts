/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert';
import * as sinon from 'sinon';

import { INVALID_SPANID, INVALID_TRACEID } from '@opentelemetry/api';

import { AWSXRayIdGenerator } from '../src';

const idGenerator = new AWSXRayIdGenerator();

describe('AwsXRayTraceId', () => {
  let traceId1: string, traceId2: string;
  let prevTime: number, currTime: number, nextTime: number;

  beforeEach(() => {
    prevTime = Math.floor(Date.now() / 1000);
    traceId1 = idGenerator.generateTraceId();
    currTime = parseInt(traceId1.substring(0, 8), 16);
    nextTime = Math.floor(Date.now() / 1000);
    traceId2 = idGenerator.generateTraceId();
  });

  afterEach(() => {
    sinon.restore();
  });

  it('returns 32 character hex strings', () => {
    assert.ok(traceId1.match(/[a-f0-9]{32}/));
    assert.ok(!traceId1.match(/^0+$/));
  });

  it('returns different ids on each call', () => {
    assert.notStrictEqual(traceId1, traceId2);
  });

  it('using current time to encode trace id', () => {
    assert.ok(currTime >= prevTime);
    assert.ok(currTime <= nextTime);
  });

  it('should not be all zero', () => {
    sinon.stub(Math, 'random').returns(0);
    const traceIdTemp = idGenerator.generateTraceId();

    assert.notStrictEqual(traceIdTemp, INVALID_TRACEID);
  });
});

describe('AwsXRaySpanId', () => {
  let spanId1: string, spanId2: string;

  beforeEach(() => {
    spanId1 = idGenerator.generateSpanId();
    spanId2 = idGenerator.generateSpanId();
  });

  afterEach(() => {
    sinon.restore();
  });

  it('returns 16 character hex strings', () => {
    assert.ok(spanId1.match(/[a-f0-9]{16}/));
    assert.ok(!spanId1.match(/^0+$/));
  });

  it('returns different ids on each call', () => {
    assert.notStrictEqual(spanId1, spanId2);
  });

  it('should not be all zero', () => {
    sinon.stub(Math, 'random').returns(0);
    const spanIdTemp = idGenerator.generateSpanId();

    assert.notStrictEqual(spanIdTemp, INVALID_SPANID);
  });
});
