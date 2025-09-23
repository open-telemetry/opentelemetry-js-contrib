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

// Includes work from:
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  resourceFromAttributes,
  emptyResource,
} from '@opentelemetry/resources';
import {
  context,
  Span,
  SpanKind,
  Tracer,
  trace,
  Attributes,
  Link,
  Context,
} from '@opentelemetry/api';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { expect } from 'expect';
import * as nock from 'nock';
import * as sinon from 'sinon';
import {
  _AWSXRayRemoteSampler,
  AWSXRayRemoteSampler,
} from '../src/remote-sampler';
import { AWSXRaySamplingClient } from '../src/aws-xray-sampling-client';
import { ATTR_CLOUD_PLATFORM } from '../src/semconv';

const DATA_DIR_SAMPLING_RULES =
  __dirname + '/data/test-remote-sampler_sampling-rules-response-sample.json';
const DATA_DIR_SAMPLING_TARGETS =
  __dirname + '/data/test-remote-sampler_sampling-targets-response-sample.json';
const TEST_URL = 'http://localhost:2000';
export const testTraceId = '0af7651916cd43dd8448eb211c80319c';

describe('AWSXRayRemoteSampler', () => {
  let sampler: AWSXRayRemoteSampler;

  afterEach(() => {
    sinon.restore();
    if (sampler != null) {
      sampler.stopPollers();
    }
  });

  it('testCreateRemoteSamplerWithEmptyResource', () => {
    sampler = new AWSXRayRemoteSampler({
      resource: emptyResource(),
    });

    expect(sampler['internalXraySampler']['rulePoller']).not.toBeFalsy();
    expect(sampler['internalXraySampler']['rulePollingIntervalMillis']).toEqual(
      300 * 1000
    );
    expect(sampler['internalXraySampler']['samplingClient']).not.toBeFalsy();
    expect(sampler['internalXraySampler']['ruleCache']).not.toBeFalsy();
    expect(sampler['internalXraySampler']['clientId']).toMatch(/[a-f0-9]{24}/);
  });

  it('testCreateRemoteSamplerWithPopulatedResource', () => {
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'test-service-name',
      [ATTR_CLOUD_PLATFORM]: 'test-cloud-platform',
    });
    sampler = new AWSXRayRemoteSampler({ resource: resource });

    expect(sampler['internalXraySampler']['rulePoller']).not.toBeFalsy();
    expect(sampler['internalXraySampler']['rulePollingIntervalMillis']).toEqual(
      300 * 1000
    );
    expect(sampler['internalXraySampler']['samplingClient']).not.toBeFalsy();
    expect(sampler['internalXraySampler']['ruleCache']).not.toBeFalsy();
    expect(
      sampler['internalXraySampler']['ruleCache']['samplerResource'].attributes
    ).toEqual(resource.attributes);
    expect(sampler['internalXraySampler']['clientId']).toMatch(/[a-f0-9]{24}/);
  });

  it('testCreateRemoteSamplerWithAllFieldsPopulated', () => {
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'test-service-name',
      [ATTR_CLOUD_PLATFORM]: 'test-cloud-platform',
    });
    sampler = new AWSXRayRemoteSampler({
      resource: resource,
      endpoint: 'http://abc.com',
      pollingInterval: 120, // seconds
    });

    expect(sampler['internalXraySampler']['rulePoller']).not.toBeFalsy();
    expect(sampler['internalXraySampler']['rulePollingIntervalMillis']).toEqual(
      120 * 1000
    );
    expect(sampler['internalXraySampler']['samplingClient']).not.toBeFalsy();
    expect(sampler['internalXraySampler']['ruleCache']).not.toBeFalsy();
    expect(
      sampler['internalXraySampler']['ruleCache']['samplerResource'].attributes
    ).toEqual(resource.attributes);
    expect(sampler['internalXraySampler']['awsProxyEndpoint']).toEqual(
      'http://abc.com'
    );
    expect(sampler['internalXraySampler']['clientId']).toMatch(/[a-f0-9]{24}/);
  });

  it('testUpdateSamplingRulesAndTargetsWithPollersAndShouldSample', done => {
    nock(TEST_URL)
      .post('/GetSamplingRules')
      .reply(200, require(DATA_DIR_SAMPLING_RULES));
    nock(TEST_URL)
      .post('/SamplingTargets')
      .reply(200, require(DATA_DIR_SAMPLING_TARGETS));
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'test-service-name',
      [ATTR_CLOUD_PLATFORM]: 'test-cloud-platform',
    });

    sampler = new AWSXRayRemoteSampler({
      resource: resource,
    });

    setTimeout(() => {
      expect(
        sampler['internalXraySampler']['ruleCache']['ruleAppliers'][0]
          .samplingRule.RuleName
      ).toEqual('test');
      expect(
        sampler.shouldSample(
          context.active(),
          testTraceId,
          'name',
          SpanKind.CLIENT,
          { abc: '1234' },
          []
        ).decision
      ).toEqual(SamplingDecision.NOT_RECORD);

      sampler['internalXraySampler']['getAndUpdateSamplingTargets']();

      setTimeout(() => {
        expect(
          sampler.shouldSample(
            context.active(),
            testTraceId,
            'name',
            SpanKind.CLIENT,
            { abc: '1234' },
            []
          ).decision
        ).toEqual(SamplingDecision.RECORD_AND_SAMPLED);
        expect(
          sampler.shouldSample(
            context.active(),
            testTraceId,
            'name',
            SpanKind.CLIENT,
            { abc: '1234' },
            []
          ).decision
        ).toEqual(SamplingDecision.RECORD_AND_SAMPLED);
        expect(
          sampler.shouldSample(
            context.active(),
            testTraceId,
            'name',
            SpanKind.CLIENT,
            { abc: '1234' },
            []
          ).decision
        ).toEqual(SamplingDecision.RECORD_AND_SAMPLED);

        done();
      }, 50);
    }, 50);
  });

  it('testLargeReservoir', done => {
    nock(TEST_URL)
      .post('/GetSamplingRules')
      .reply(200, require(DATA_DIR_SAMPLING_RULES));
    nock(TEST_URL)
      .post('/SamplingTargets')
      .reply(200, require(DATA_DIR_SAMPLING_TARGETS));
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'test-service-name',
      [ATTR_CLOUD_PLATFORM]: 'test-cloud-platform',
    });
    const attributes = { abc: '1234' };

    sampler = new AWSXRayRemoteSampler({
      resource: resource,
    });
    sampler['internalXraySampler']['getAndUpdateSamplingRules']();

    setTimeout(() => {
      expect(
        sampler['internalXraySampler']['ruleCache']['ruleAppliers'][0]
          .samplingRule.RuleName
      ).toEqual('test');
      expect(
        sampler.shouldSample(
          context.active(),
          testTraceId,
          'name',
          SpanKind.CLIENT,
          attributes,
          []
        ).decision
      ).toEqual(SamplingDecision.NOT_RECORD);
      sampler['internalXraySampler']['getAndUpdateSamplingTargets']();

      setTimeout(() => {
        const clock = sinon.useFakeTimers(Date.now());
        clock.tick(1500);
        let sampled = 0;
        for (let i = 0; i < 1005; i++) {
          if (
            sampler.shouldSample(
              context.active(),
              testTraceId,
              'name',
              SpanKind.CLIENT,
              attributes,
              []
            ).decision !== SamplingDecision.NOT_RECORD
          ) {
            sampled++;
          }
        }
        clock.restore();

        expect(
          sampler['internalXraySampler']['ruleCache']['ruleAppliers'][0][
            'reservoirSampler'
          ]['quota']
        ).toEqual(1000);
        expect(sampled).toEqual(1000);
        done();
      }, 50);
    }, 50);
  });

  it('testSomeReservoir', done => {
    nock(TEST_URL)
      .post('/GetSamplingRules')
      .reply(200, require(DATA_DIR_SAMPLING_RULES));
    nock(TEST_URL)
      .post('/SamplingTargets')
      .reply(200, require(DATA_DIR_SAMPLING_TARGETS));
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'test-service-name',
      [ATTR_CLOUD_PLATFORM]: 'test-cloud-platform',
    });
    const attributes = {
      abc: 'non-matching attribute value, use default rule',
    };

    sampler = new AWSXRayRemoteSampler({
      resource: resource,
    });
    sinon
      .stub(sampler['internalXraySampler']['fallbackSampler'], 'shouldSample')
      .callsFake(
        (
          context: Context,
          traceId: string,
          spanName: string,
          spanKind: SpanKind,
          attributes: Attributes,
          links: Link[]
        ) => {
          return {
            decision: SamplingDecision.NOT_RECORD,
            attributes: attributes,
          };
        }
      );
    sampler['internalXraySampler']['getAndUpdateSamplingRules']();

    setTimeout(() => {
      expect(
        sampler['internalXraySampler']['ruleCache']['ruleAppliers'][0]
          .samplingRule.RuleName
      ).toEqual('test');
      expect(
        sampler.shouldSample(
          context.active(),
          testTraceId,
          'name',
          SpanKind.CLIENT,
          attributes,
          []
        ).decision
      ).toEqual(SamplingDecision.RECORD_AND_SAMPLED);
      sampler['internalXraySampler']['getAndUpdateSamplingTargets']();

      setTimeout(() => {
        const clock = sinon.useFakeTimers(Date.now());
        clock.tick(1000);
        let sampled = 0;
        for (let i = 0; i < 1000; i++) {
          if (
            sampler.shouldSample(
              context.active(),
              testTraceId,
              'name',
              SpanKind.CLIENT,
              attributes,
              []
            ).decision !== SamplingDecision.NOT_RECORD
          ) {
            sampled++;
          }
        }
        clock.restore();

        expect(sampled).toEqual(100);
        done();
      }, 50);
    }, 50);
  });

  it('generates valid ClientId', () => {
    const clientId: string = _AWSXRayRemoteSampler['generateClientId']();
    const match: RegExpMatchArray | null = clientId.match(/[0-9a-z]{24}/g);
    expect(match).not.toBeNull();
  });

  it('toString()', () => {
    expect(
      new AWSXRayRemoteSampler({ resource: emptyResource() }).toString()
    ).toEqual(
      'AWSXRayRemoteSampler{root=ParentBased{root=_AWSXRayRemoteSampler{awsProxyEndpoint=http://localhost:2000, rulePollingIntervalMillis=300000}, remoteParentSampled=AlwaysOnSampler, remoteParentNotSampled=AlwaysOffSampler, localParentSampled=AlwaysOnSampler, localParentNotSampled=AlwaysOffSampler}'
    );
  });

  it('ParentBased AWSXRayRemoteSampler creates expected Statistics from the 1 Span with no Parent, disregarding 2 Child Spans', done => {
    const defaultRuleDir =
      __dirname + '/data/get-sampling-rules-response-sample-sample-all.json';
    nock(TEST_URL)
      .post('/GetSamplingRules')
      .reply(200, require(defaultRuleDir));

    sampler = new AWSXRayRemoteSampler({
      resource: emptyResource(),
    });
    const tracerProvider: NodeTracerProvider = new NodeTracerProvider({
      sampler: sampler,
    });
    const tracer: Tracer = tracerProvider.getTracer('test');

    setTimeout(() => {
      const span0 = tracer.startSpan('test0');
      const ctx = trace.setSpan(context.active(), span0);
      const span1: Span = tracer.startSpan('test1', {}, ctx);
      const span2: Span = tracer.startSpan('test2', {}, ctx);
      span2.end();
      span1.end();
      span0.end();

      // span1 and span2 are child spans of root span0
      // For AWSXRayRemoteSampler (ParentBased), expect only span0 to update statistics
      expect(
        sampler['internalXraySampler']['ruleCache']['ruleAppliers'][0][
          'statistics'
        ].RequestCount
      ).toBe(1);
      expect(
        sampler['internalXraySampler']['ruleCache']['ruleAppliers'][0][
          'statistics'
        ].SampleCount
      ).toBe(1);
      done();
    }, 50);
  });

  it('Non-ParentBased _AWSXRayRemoteSampler creates expected Statistics based on all 3 Spans, disregarding Parent Span Sampling Decision', done => {
    const defaultRuleDir =
      __dirname + '/data/get-sampling-rules-response-sample-sample-all.json';
    nock(TEST_URL)
      .post('/GetSamplingRules')
      .reply(200, require(defaultRuleDir));

    sampler = new AWSXRayRemoteSampler({
      resource: emptyResource(),
    });
    const internalSampler: _AWSXRayRemoteSampler =
      sampler['internalXraySampler'];
    const tracerProvider: NodeTracerProvider = new NodeTracerProvider({
      sampler: internalSampler,
    });
    const tracer: Tracer = tracerProvider.getTracer('test');

    setTimeout(() => {
      const span0 = tracer.startSpan('test0');
      const ctx = trace.setSpan(context.active(), span0);
      const span1: Span = tracer.startSpan('test1', {}, ctx);
      const span2: Span = tracer.startSpan('test2', {}, ctx);
      span2.end();
      span1.end();
      span0.end();

      // span1 and span2 are child spans of root span0
      // For _AWSXRayRemoteSampler (Non-ParentBased), expect all 3 spans to update statistics
      expect(
        internalSampler['ruleCache']['ruleAppliers'][0]['statistics']
          .RequestCount
      ).toBe(3);
      expect(
        internalSampler['ruleCache']['ruleAppliers'][0]['statistics']
          .SampleCount
      ).toBe(3);
      done();
    }, 50);
  });
});

describe('_AWSXRayRemoteSampler', () => {
  const pollingInterval = 60;
  let clock: sinon.SinonFakeTimers;
  let fetchSamplingRulesSpy: sinon.SinonSpy;
  let sampler: _AWSXRayRemoteSampler | undefined;

  beforeEach(() => {
    fetchSamplingRulesSpy = sinon.spy(
      AWSXRaySamplingClient.prototype,
      'fetchSamplingRules'
    );
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    if (sampler != null) {
      sampler.stopPollers();
    }
    fetchSamplingRulesSpy.restore();
    clock.restore();
  });

  it('should invoke fetchSamplingRules() after initialization', async () => {
    sampler = new _AWSXRayRemoteSampler({
      resource: emptyResource(),
      pollingInterval: pollingInterval,
    });
    sinon.assert.calledOnce(fetchSamplingRulesSpy);
  });

  it('should invoke fetchSamplingRules() 3 times after initialization and 2 intervals have passed', async () => {
    sampler = new _AWSXRayRemoteSampler({
      resource: emptyResource(),
      pollingInterval: pollingInterval,
    });
    clock.tick(pollingInterval * 1000 + 5000);
    clock.tick(pollingInterval * 1000 + 5000);

    sinon.assert.calledThrice(fetchSamplingRulesSpy);
  });
});
