/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const assert = require('node:assert/strict');
const { exporter, provider } = require('./register.cjs');

module.exports = async function exercise({
  RunnableSequence,
  RunnableLambda,
  DynamicTool,
  FakeListChatModel,
  createAgent,
}) {
  const workflow = RunnableSequence.from([
    RunnableLambda.from(input => input.toUpperCase()),
    RunnableLambda.from(input => `${input}!`),
  ]).withConfig({ runName: 'fixture-workflow' });
  assert.equal(await workflow.invoke('test'), 'TEST!');
  const stream = await workflow.stream('stream');
  assert.ok(stream instanceof ReadableStream);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(chunks.join(''), 'STREAM!');

  const tool = new DynamicTool({
    name: 'fixture-tool',
    description: 'Generated local echo tool',
    func: async input => input,
  });
  assert.equal(await tool.invoke('test'), 'test');

  if (createAgent) {
    class LocalChatModel extends FakeListChatModel {
      bindTools() {
        return this;
      }
    }
    const agent = createAgent({
      name: 'fixture-agent',
      model: new LocalChatModel({ responses: ['generated answer'] }),
      tools: [],
    });
    const result = await agent.invoke({
      messages: [{ role: 'user', content: 'generated prompt' }],
    });
    assert.equal(result.messages.at(-1).content, 'generated answer');
    const [first, sibling] = (
      await agent.stream({
        messages: [{ role: 'user', content: 'generated prompt' }],
      })
    ).tee();
    const reader = first.pipeThrough(new TransformStream()).getReader();
    while (!(await reader.read()).done) {}
    await provider.forceFlush();
    const agentSpans = exporter
      .getFinishedSpans()
      .filter(span => span.name === 'invoke_agent fixture-agent');
    await sibling.cancel();
    assert.equal(agentSpans.length, 2);
    const [encoded, encodedSibling] = (
      await agent.stream(
        { messages: [{ role: 'user', content: 'generated prompt' }] },
        { encoding: 'text/event-stream' }
      )
    ).tee();
    const encodedReader = encoded
      .pipeThrough(new TransformStream())
      .getReader();
    while (!(await encodedReader.read()).done) {}
    await provider.forceFlush();
    const encodedAgentSpans = exporter
      .getFinishedSpans()
      .filter(span => span.name === 'invoke_agent fixture-agent');
    await encodedSibling.cancel();
    assert.equal(encodedAgentSpans.length, 3);
  }
  await provider.forceFlush();
  const spans = exporter.getFinishedSpans();
  assert.deepEqual(spans.map(span => span.name).sort(), [
    'execute_tool fixture-tool',
    ...(createAgent
      ? [
          'invoke_agent fixture-agent',
          'invoke_agent fixture-agent',
          'invoke_agent fixture-agent',
        ]
      : []),
    'invoke_workflow fixture-workflow',
    'invoke_workflow fixture-workflow',
  ]);
  if (createAgent) {
    assert.deepEqual(
      JSON.parse(
        spans.find(span => span.name === 'invoke_agent fixture-agent')
          .attributes['gen_ai.output.messages']
      ),
      [
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'generated answer' }],
        },
      ]
    );
  }
  await provider.shutdown();
  console.log('LangChain fixture passed');
};
