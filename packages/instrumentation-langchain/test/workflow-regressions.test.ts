/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { instrumentation } from './load-instrumentation';
import * as assert from 'node:assert/strict';
import { diag, DiagLogLevel } from '@opentelemetry/api';
import {
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import type { RunnableConfig } from '@langchain/core/runnables';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

describe('LangChain workflow regressions', () => {
  before(function () {
    if (Number(process.versions.node.split('.')[0]) < 20) this.skip();
  });
  afterEach(() => {
    instrumentation.disable();
    diag.disable();
  });

  for (const capture of [false, true]) {
    for (const property of ['metadata', 'configurable', 'runName'] as const) {
      it(`does not evaluate ${property} getters for telemetry (capture=${capture})`, async () => {
        const diagnostics: unknown[][] = [];
        diag.setLogger(
          {
            error() {},
            warn(...args) {
              diagnostics.push(args);
            },
            info() {},
            debug() {},
            verbose() {},
          },
          DiagLogLevel.ALL
        );
        const run = async (enabled: boolean) => {
          let reads = 0;
          const options = Object.defineProperty({}, property, {
            enumerable: true,
            get() {
              reads++;
              return property === 'runName'
                ? `name-${reads}`
                : { counter: reads };
            },
          });
          const chain = RunnableSequence.from([
            RunnableLambda.from((_input: string, config?: RunnableConfig) =>
              property === 'runName' ? reads : config?.[property]?.counter
            ),
            RunnableLambda.from(value => value),
          ]);
          instrumentation.setConfig({ captureMessageContent: capture });
          if (enabled) instrumentation.enable();
          else instrumentation.disable();
          resetMemoryExporter();
          const result = await chain.invoke('input', options);
          return { reads, result };
        };
        const baseline = await run(false);
        assert.deepEqual(await run(true), baseline);
        assert.equal(baseline.reads, 1);
        assert.equal(baseline.result, 1);
        assert.equal(getTestSpans().length, 1);
        assert.equal(
          getTestSpans()[0].name,
          'invoke_workflow RunnableSequence'
        );
        assert.equal(
          getTestSpans()[0].attributes['gen_ai.conversation.id'],
          undefined
        );
        assert.ok(
          diagnostics.some(args =>
            args.includes(
              'LangChain: omitting accessor-backed configuration attribute'
            )
          )
        );
      });
    }
  }

  for (const container of ['metadata', 'configurable'] as const) {
    for (const alias of ['thread_id', 'session_id', 'conversation_id']) {
      it(`does not reevaluate nested ${container}.${alias} getters`, async () => {
        const run = async (enabled: boolean) => {
          let reads = 0;
          const options = {
            [container]: Object.defineProperty({}, alias, {
              enumerable: true,
              get() {
                return `session-${++reads}`;
              },
            }),
          };
          const chain = RunnableSequence.from([
            RunnableLambda.from(
              (_input: string, config?: RunnableConfig) =>
                config?.[container]?.[alias]
            ),
            RunnableLambda.from(value => value),
          ]);
          instrumentation.setConfig({ captureMessageContent: false });
          if (enabled) instrumentation.enable();
          else instrumentation.disable();
          resetMemoryExporter();
          const result = await chain.invoke('input', options);
          return { reads, result };
        };
        const baseline = await run(false);
        assert.deepEqual(await run(true), baseline);
        assert.equal(
          getTestSpans()[0].attributes['gen_ai.conversation.id'],
          undefined
        );
      });
    }
  }

  it('keeps batch result roles separate from string message history', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    instrumentation.enable();
    resetMemoryExporter();
    const chain = RunnableSequence.from([
      RunnableLambda.from((value: string) => `generated ${value}`),
      RunnableLambda.from(value => value),
    ]);
    assert.deepEqual(await chain.batch(['one', 'two']), [
      'generated one',
      'generated two',
    ]);
    const attrs = getTestSpans()[0].attributes;
    assert.deepEqual(JSON.parse(String(attrs['gen_ai.output.messages'])), [
      {
        role: 'assistant',
        parts: [{ type: 'text', content: 'generated one' }],
      },
      {
        role: 'assistant',
        parts: [{ type: 'text', content: 'generated two' }],
      },
    ]);
    assert.deepEqual(JSON.parse(String(attrs['gen_ai.input.messages'])), [
      { role: 'user', parts: [{ type: 'text', content: 'one' }] },
      { role: 'user', parts: [{ type: 'text', content: 'two' }] },
    ]);
    assert.equal(await chain.invoke('three'), 'generated three');
    assert.equal(
      JSON.parse(
        String(getTestSpans()[1].attributes['gen_ai.output.messages'])
      )[0].role,
      'assistant'
    );
  });

  it('preserves batch order, explicit roles, nested histories and result identity', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    instrumentation.enable();
    resetMemoryExporter();
    const results = [
      'generated',
      new AIMessage('sdk answer'),
      [new HumanMessage('history'), new AIMessage('nested answer')],
      { role: 'assistant', content: 'plain answer' },
      {
        messages: [
          ['user', 'question'],
          ['assistant', 'wrapped answer'],
        ],
      },
      ['first user message', 'second user message'],
    ];
    const chain = RunnableSequence.from([
      RunnableLambda.from((index: number) => results[index]),
      RunnableLambda.from(value => value),
    ]);
    const output = await chain.batch(results.map((_, index) => index));
    output.forEach((value, index) => assert.equal(value, results[index]));
    assert.deepEqual(
      JSON.parse(
        String(getTestSpans()[0].attributes['gen_ai.output.messages'])
      ),
      [
        ['assistant', 'generated'],
        ['assistant', 'sdk answer'],
        ['user', 'history'],
        ['assistant', 'nested answer'],
        ['assistant', 'plain answer'],
        ['user', 'question'],
        ['assistant', 'wrapped answer'],
        ['user', 'first user message'],
        ['user', 'second user message'],
      ].map(([role, content]) => ({ role, parts: [{ type: 'text', content }] }))
    );
  });
});
