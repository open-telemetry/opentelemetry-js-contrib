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

import { context, SpanStatusCode } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  SEMATTRS_CODE_FILEPATH,
  SEMATTRS_CODE_FUNCTION,
  SEMATTRS_CODE_LINENO,
  SEMATTRS_CODE_NAMESPACE,
  SEMRESATTRS_SERVICE_NAME,
} from '@opentelemetry/semantic-conventions';
import { resourceFromAttributes } from '@opentelemetry/resources';

import * as path from 'path';
import * as assert from 'assert';
import * as fs from 'fs';
import * as semver from 'semver';

import { CucumberInstrumentation, AttributeNames } from '../src';

const LIB_VERSION = require('@cucumber/cucumber/package.json').version;
const hasRunAttempt = semver.gte(LIB_VERSION, '8.8.0');

const instrumentation = new CucumberInstrumentation();
instrumentation.enable();
instrumentation.disable();

import {
  IConfiguration,
  loadConfiguration,
  loadSupport,
  runCucumber,
} from '@cucumber/cucumber/api';
import { PassThrough } from 'stream';

describe('CucumberInstrumentation', () => {
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: 'CucumberInstrumentation',
    }),
    spanProcessors: [spanProcessor],
  });
  const contextManager = new AsyncHooksContextManager().enable();

  before(() => {
    instrumentation.setTracerProvider(provider);
    context.setGlobalContextManager(contextManager);
    instrumentation.enable();
  });

  afterEach(() => {
    contextManager.disable();
    contextManager.enable();
    memoryExporter.reset();
  });

  after(async () => {
    await provider.shutdown();
  });

  const init = async (
    feature: string,
    providedConfiguration?: Partial<IConfiguration>
  ) => {
    // clean-up require cache to re-register cucumber hooks for a new run
    [
      path.join('features', 'support', 'world'),
      path.join('features', 'step_definitions', 'steps'),
    ].forEach(search => {
      const key = Object.keys(require.cache).find(key => key.includes(search));
      if (key == null) return;
      delete require.cache[key];
    });
    const featurePath = path.join(__dirname, 'current.feature');
    await fs.promises.writeFile(featurePath, feature, 'utf-8');
    const { runConfiguration } = await loadConfiguration({
      provided: {
        ...providedConfiguration,
        paths: [featurePath],
        require: [
          path.join(__dirname, 'features', 'support', 'world.ts'),
          path.join(__dirname, 'features', 'step_definitions', 'steps.ts'),
        ],
      },
    });
    const support = await loadSupport(runConfiguration);
    const merged = { ...runConfiguration, support };
    await runCucumber(merged, {
      // mute cucumber's output
      stderr: new PassThrough(),
      stdout: new PassThrough(),
    });
  };

  describe('enabled instrumentation', () => {
    describe('basic.feature', () => {
      beforeEach(async () => {
        await init(`
          @feature-tag
          Feature: Basic
          A very basic feature file with a single scenario

            @scenario-tag @tag
            Scenario: Button pushing
            Mostly pushing buttons
            but also tables
              When I push the button
              Then it is pushed to "limit"
              And does something with the table
                | Cucumber     | Cucumis sativus |
                | Burr Gherkin | Cucumis anguria |
        `);
      });

      it('generates spans for cucumber execution', () => {
        const spans = memoryExporter.getFinishedSpans();
        // should have Feature span
        const parent = spans.find(span => span.name.startsWith('Feature'));
        assert(parent, 'Expected a parent span');

        assert.deepEqual(
          spans.map(span => span.name),
          [
            'Before',
            'BeforeStep',
            'When(/I push the button/)',
            'AfterStep',
            'I push the button',
            'BeforeStep',
            'Then(it is pushed to {string})',
            'AfterStep',
            'it is pushed to "limit"',
            'BeforeStep',
            'Then(does something with the table)',
            'AfterStep',
            'does something with the table',
            'After',
            hasRunAttempt && 'Attempt #0',
            'Feature: Basic. Scenario: Button pushing',
          ].filter(Boolean),
          'Expected all hooks to be patched'
        );
      });

      it('adds scenario attributes to parent span', () => {
        const spans = memoryExporter.getFinishedSpans();
        const parent = spans.find(span => span.name.startsWith('Feature'));
        assert(parent, 'Expected a parent span');

        assert.deepEqual(parent.attributes, {
          [SEMATTRS_CODE_FILEPATH]: path.join('test', 'current.feature'),
          [SEMATTRS_CODE_LINENO]: 7,
          [SEMATTRS_CODE_FUNCTION]: 'Button pushing',
          [SEMATTRS_CODE_NAMESPACE]: 'Basic',
          [AttributeNames.FEATURE_DESCRIPTION]:
            '          A very basic feature file with a single scenario',
          [AttributeNames.FEATURE_LANGUAGE]: 'en',
          [AttributeNames.FEATURE_TAGS]: ['@feature-tag'],
          [AttributeNames.SCENARIO_DESCRIPTION]:
            '            Mostly pushing buttons\n            but also tables',
          [AttributeNames.SCENARIO_TAGS]: ['@scenario-tag', '@tag'],
          [AttributeNames.STEP_STATUS]: 'PASSED',
        });
      });

      it('adds step args to span attributes', () => {
        const spans = memoryExporter.getFinishedSpans();
        const parameterisedSpan = spans.find(span =>
          span.name.startsWith('Then(it is pushed')
        );
        assert(parameterisedSpan);

        assert.deepEqual(parameterisedSpan.attributes, {
          [`${AttributeNames.STEP_ARGS}[0]`]: 'limit',
        });
      });

      it('adds step table to span attributes', () => {
        const spans = memoryExporter.getFinishedSpans();
        const tableSpan = spans.find(span =>
          span.name.startsWith('Then(does something')
        );
        assert(tableSpan);

        assert.deepEqual(tableSpan.attributes, {
          [`${AttributeNames.STEP_ARGS}[0]`]: JSON.stringify([
            ['Cucumber', 'Cucumis sativus'],
            ['Burr Gherkin', 'Cucumis anguria'],
          ]),
        });
      });
    });

    describe('examples.feature', () => {
      beforeEach(async () => {
        await init(`
          Feature: Examples

            Scenario: <type> button pushing
              Given a <type> step
              When I push the button
              Then it is pushed to "limit"
              And does something with the table
                | Cucumber     | Cucumis sativus |
                | Burr Gherkin | Cucumis anguria |

            Examples:
              | type    |
              | passing |
              | failing |
        `);
      });

      it('has a scenario for every example', () => {
        const spans = memoryExporter.getFinishedSpans();
        const scenarios = spans.filter(span => span.name.startsWith('Feature'));
        assert.equal(scenarios.length, 2);

        assert.deepEqual(
          scenarios.map(span => span.name),
          [
            'Feature: Examples. Scenario: passing button pushing',
            'Feature: Examples. Scenario: failing button pushing',
          ]
        );
      });

      it('sets a span of a failing step to error', () => {
        const spans = memoryExporter.getFinishedSpans();
        const span = spans.find(span => span.name === 'Given(a failing step)');
        assert(span);

        assert.equal(span.status.code, SpanStatusCode.ERROR);
      });
    });

    if (hasRunAttempt) {
      describe('attempts.feature', () => {
        beforeEach(async () => {
          await init(
            `
          Feature: Attempts

            Scenario: fail button pushing
              Given a failing step
              When I push the button
        `,
            { retry: 2 }
          );
        });

        it('generates spans for each attempt', () => {
          const spans = memoryExporter.getFinishedSpans();
          const parent = spans.find(span => span.name.includes('Feature'));
          assert(parent);

          const attemptSpans = spans.filter(span =>
            span.name.startsWith('Attempt')
          );
          assert.equal(attemptSpans.length, 3);

          assert.deepEqual(
            attemptSpans.map(span => span.parentSpanContext?.spanId),
            Array(3).fill(parent.spanContext().spanId)
          );
        });

        it('creates scanario spans as children of attempts', () => {
          const spans = memoryExporter.getFinishedSpans();
          const attemptSpans = spans.filter(span =>
            span.name.startsWith('Attempt')
          );
          assert.equal(attemptSpans.length, 3);

          attemptSpans.forEach(attempt => {
            assert.equal(
              spans.filter(
                span =>
                  span.parentSpanContext?.spanId ===
                  attempt.spanContext().spanId
              ).length,
              4
            );
          });
        });
      });
    }

    describe('doc-string.feature', () => {
      beforeEach(async () => {
        await init(`
          Feature: a feature
            Scenario: a scenario
              Given a doc string step
                """
                The cucumber (Cucumis sativus) is a widely cultivated plant in the gourd family Cucurbitaceae.
                """
              When I push the button
        `);
      });

      it('adds doc strings as arg to span attributes', () => {
        const spans = memoryExporter.getFinishedSpans();
        const parent = spans.find(span => span.name.includes('Feature'));
        assert(parent);

        const span = spans.find(span => span.name.startsWith('Given(a doc'));
        assert(span);
        assert.deepEqual(span.attributes, {
          [`${AttributeNames.STEP_ARGS}[0]`]:
            'The cucumber (Cucumis sativus) is a widely cultivated plant in the gourd family Cucurbitaceae.',
        });
      });
    });

    describe('background.feature', () => {
      beforeEach(async () => {
        await init(`
          Feature: a feature
            Background:
              Given a doc string step
                """
                This is a background
                """

            Scenario: a scenario
              When I push the button
        `);
      });

      it('adds spans for background steps', () => {
        const spans = memoryExporter.getFinishedSpans();
        const parent = spans.find(span => span.name.includes('Feature'));
        assert(parent);

        const span = spans.find(span => span.name.startsWith('Given(a doc'));
        assert(span);
        assert.deepEqual(span.attributes, {
          [`${AttributeNames.STEP_ARGS}[0]`]: 'This is a background',
        });
      });
    });

    describe('hook-failures.feature', () => {
      ['Before', 'BeforeStep', 'After', 'AfterStep'].forEach(hook => {
        it(`sets ${hook} hook to error`, async () => {
          await init(`
            Feature: Hook failure spans

              Scenario: Fails ${hook} Hook
                When I push the button
          `);
          const spans = memoryExporter.getFinishedSpans();
          const parent = spans.find(span =>
            span.name.includes(`Fails ${hook}`)
          );
          assert(parent);
          assert.equal(parent.status.code, SpanStatusCode.ERROR);
          assert.equal(parent.status.message, 'FAILED');
          assert.equal(parent.attributes[AttributeNames.STEP_STATUS], 'FAILED');

          const span = spans.find(
            span =>
              span.spanContext().traceId === parent.spanContext().traceId &&
              span.name === hook
          );
          assert(span);

          assert.equal(span.status.code, SpanStatusCode.ERROR);
        });
      });
    });

    describe('undefined.feature', () => {
      beforeEach(async () => {
        await init(`
          Feature: Undefined steps

            Scenario:
              When an undefined step is encountered
              Then does nothing
        `);
      });

      it('sets undefined steps to error', () => {
        const spans = memoryExporter.getFinishedSpans();
        const parent = spans.find(span => span.name.includes('Feature'));
        assert(parent);
        assert.equal(parent.status.code, SpanStatusCode.ERROR);
        assert.equal(parent.status.message, 'UNDEFINED');
        assert.equal(
          parent.attributes[AttributeNames.STEP_STATUS],
          'UNDEFINED'
        );

        const span = spans.find(span => span.name.startsWith('an undefined'));
        assert(span);
        assert.equal(span.status.code, SpanStatusCode.ERROR);
        assert.equal(span.status.message, 'UNDEFINED');
        assert.equal(span.attributes[AttributeNames.STEP_STATUS], 'UNDEFINED');

        const skippedSpan = spans.find(span => span.name === 'does nothing');
        assert(skippedSpan);
        assert.equal(
          skippedSpan.attributes[AttributeNames.STEP_STATUS],
          'SKIPPED'
        );
      });
    });

    describe('ambiguous.feature', () => {
      beforeEach(async () => {
        await init(`
          Feature: Ambiguous step

            Scenario:
              When an ambiguous step is encountered
        `);
      });

      it('sets ambiguous steps to error', () => {
        const spans = memoryExporter.getFinishedSpans();
        const parent = spans.find(span => span.name.includes('Feature'));
        assert(parent);
        assert.equal(parent.status.code, SpanStatusCode.ERROR);
        assert.equal(parent.status.message, 'AMBIGUOUS');
        assert.equal(
          parent.attributes[AttributeNames.STEP_STATUS],
          'AMBIGUOUS'
        );

        const span = spans.find(span => span.name.startsWith('an ambiguous'));
        assert(span);

        assert.equal(span.status.code, SpanStatusCode.ERROR);
        assert.equal(
          span.status.message?.split('\n')[0],
          'Multiple step definitions match:'
        );
      });
    });

    describe('skipped.feature', () => {
      it('adds skipped event to skipped steps', async () => {
        await init(`
          Feature: Skipping a step

            Scenario:
              Given a skipped step
              Then it is pushed to "limit"
        `);
        const spans = memoryExporter.getFinishedSpans();
        const parent = spans.find(span => span.name.includes('Feature'));
        assert(parent);
        assert.equal(parent.attributes[AttributeNames.STEP_STATUS], 'SKIPPED');

        const span = spans.find(span => span.name.startsWith('a skipped step'));
        assert(span);
        assert.equal(span.attributes[AttributeNames.STEP_STATUS], 'SKIPPED');
      });

      it('adds skipped event to skipped steps in before hook', async () => {
        await init(`
          Feature: Skipping a step

            @skip
            Scenario:
              When I push the button
        `);
        const spans = memoryExporter.getFinishedSpans();
        const parent = spans.find(
          span =>
            span.name.includes('Feature') &&
            (
              span.attributes[AttributeNames.SCENARIO_TAGS] as string[]
            )?.includes?.('@skip')
        );
        assert(parent);
        assert.equal(parent.attributes[AttributeNames.STEP_STATUS], 'SKIPPED');
      });
    });

    describe('pending.feature', () => {
      it('adds pending event to pending steps', async () => {
        await init(`
          Feature: pending

            Scenario: pending scenario
              Given a pending step
              When I push the button
        `);
        const spans = memoryExporter.getFinishedSpans();
        const parent = spans.find(span => span.name.includes('Feature'));
        assert(parent);
        assert.equal(parent.attributes[AttributeNames.STEP_STATUS], 'PENDING');

        const span = spans.find(span => span.name.startsWith('a pending step'));
        assert(span);
        assert.equal(span.attributes[AttributeNames.STEP_STATUS], 'PENDING');
      });

      it('adds pending event to pending steps in before hook', async () => {
        await init(`
          Feature: pending

            @pending
            Scenario: pending scenario
              When I push the button
        `);
        const spans = memoryExporter.getFinishedSpans();
        const parent = spans.find(span => span.name.includes('Feature'));
        assert(parent);
        assert.equal(parent.attributes[AttributeNames.STEP_STATUS], 'PENDING');

        const span = spans.find(span =>
          span.name.startsWith('I push the button')
        );
        assert(span);
        assert.equal(span.attributes[AttributeNames.STEP_STATUS], 'SKIPPED');
      });
    });
  });

  describe('disabled instrumentation', () => {
    before(() => {
      instrumentation.disable();
    });

    after(() => {
      instrumentation.enable();
    });

    it('does not create spans', async () => {
      await init(`
        Feature: a feature
          Scenario: a scenario
          When I do anything at all
          Then no spans are recorded
      `);
      const spans = memoryExporter.getFinishedSpans();
      assert.equal(spans.length, 0);
    });
  });
});
