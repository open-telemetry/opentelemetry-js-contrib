# OpenAI Agents instrumentation test scenarios

This file documents the end-to-end scenarios covered by `test/e2e-scenarios.test.ts`,
the span tree each one is expected to produce, and why it is worth pinning down.

## How these tests work

Every scenario in `e2e-scenarios.test.ts` drives the **real `@openai/agents` Runner**
(real tool dispatch, real handoff machinery, real streaming loop) but replaces the
model with a scripted `Model` that replays a fixed list of turns and can be told to
fail on a chosen turn. That keeps them deterministic, offline, and free of an API key.

A recorded-cassette test against the real OpenAI API lives separately in
`test/sdk-integration.test.ts` (`recorded OpenAI responses`). Error scenarios cannot be
cassette-backed, because the API cannot be made to fail on demand.

Each test asserts a rendered span tree. Indentation is parent/child, siblings are
ordered by start time and then completion order, `[ERROR <error.type>]` marks a span with `SpanStatusCode.ERROR`,
and a `!orphan` prefix marks a span whose parent was never exported — which is how a
leaked run span shows up.

## Things these scenarios encode

Three behaviors are easy to get wrong and are asserted repeatedly:

- **LLM calls produce no span.** Only SDK `agent` and `function` span types are mapped,
  so `generation`/`response` spans are invisible. A model call is observable only
  through the agent span that contains it and through error propagation.
- **Handoffs produce flat siblings.** A handoff does not nest the receiving agent under
  the sending one, and the `transfer_to_*` call is not reported as a tool execution.
- **Nesting comes from `agent.asTool()`**, not from handoffs. That is the only way to
  get an `invoke_agent` span beneath an `execute_tool` span.

## H — hierarchy, happy path

| ID | Test name | Span tree |
| --- | --- | --- |
| H1 | `maps a single agent run to one invoke_agent span` | `run > agent` |
| H2 | `nests a tool call under the agent that invoked it` | `run > agent > tool` |
| H3 | `keeps one agent span across multiple model turns` | `run > agent > (tool, tool)` |
| H4 | `nests an agent-as-tool invocation under its calling tool` | `run > outer > tool > inner` |

H3 matters because the agent loops once per model turn; a per-turn span would be wrong.
H4 is the only source of genuine `invoke_agent` nesting.

## HO — handoffs

| ID | Test name | Expected |
| --- | --- | --- |
| HO1 | `preserves the span hierarchy across agents, tools, and turns` | Lives in `sdk-integration.test.ts`; cassette-backed against the real API |
| HO2 | `keeps every agent in a multi-hop handoff chain under the run` | `A -> B -> C` yields three sibling agent spans under the run |
| HO3 | `does not report a handoff call as a tool execution` | No `execute_tool transfer_to_*` span is emitted |
| HO4 | `records a post-handoff failure on the receiving agent only` | Sender stays UNSET, receiver and run are ERROR |
| HO5 | `records a handoff hook failure on the sending agent` | Sender and run are ERROR; the target agent gets no span at all |
| HO6 | `keeps a handoff inside an agent-as-tool under its calling tool` | Both sub-agents sit under the `execute_tool` span |

HO4 is the attribution case: the error must land on the agent that was active when it
happened, not on the first agent in the run. HO5 checks that an aborted handoff leaves
no orphan span for an agent that never started. HO6 combines both nesting mechanisms
and is the most likely place for a trace-ownership bug to surface.

## E — error propagation, non-streaming

| ID | Test name | Expected |
| --- | --- | --- |
| E1 | `propagates a model failure to the agent and run spans` | Agent and run ERROR |
| E2 | `stops a recovered tool failure at the tool span` | Tool ERROR; agent and run stay UNSET |
| E3 | `propagates a nested agent failure to its calling tool` | Inner agent and its `execute_tool` ERROR; outer agent and run stay UNSET |
| E4 | `ends every span when a nested agent failure aborts the run` | The whole chain, including the run, is ERROR |
| E5 | `ends an internally-created trace when task spans are disabled` | Already covered in `sdk-integration.test.ts` |

E2 and E3 encode recovery: the SDK feeds a failed tool result back to the model and
keeps going, so the error must **not** climb past the tool boundary. E4 is the contrast
case where the run really does abort.

## C — context propagation

| ID | Test name | Expected |
| --- | --- | --- |
| C1 | `does not nest spans from other instrumentations under agent spans` | A span started by another instrumentation during a run begins its own trace |

C1 pins a known limitation rather than desired behavior. The instrumentation builds its
hierarchy from SDK tracing callbacks and never makes the resulting context active, so
model-call spans from `@opentelemetry/instrumentation-openai` are recorded but land in a
separate trace. The README's "What is not instrumented" section explains why. If context
propagation is ever implemented, C1 should fail and be replaced by one asserting the
nesting.

## S — streaming

| ID | Test name | Expected |
| --- | --- | --- |
| S1 | `preserves the hierarchy for a streamed run` | Same tree as H2 |
| S2 | `propagates a streamed model failure to the agent and run spans` | Agent and run ERROR |
| S3 | `propagates a streamed failure inside a caller-managed trace` | `withTrace` wrapping a streamed run |
| S4 | `records a streamed failure when task spans are disabled` | Run carries ERROR and `error.type` with `includeTaskAndTurnSpans: false` |
| S5 | `propagates a streamed nested agent failure to its calling tool` | Streamed variant of E3 |

**A streamed run must have its stream fully consumed** or the SDK never ends the trace
and the run span leaks. This is SDK behavior, not an instrumentation bug — it reproduces
on `main`. Streaming tests therefore iterate the stream before awaiting `completed`.

S4 guards the gap from PR review: a streamed run resolves before its stream does, so the
run span has to stay open until the stream settles for a late failure to be recorded.

## Running

All scenario tests are offline and need no API key:

```bash
cd packages/instrumentation-openai-agents

# just this file
npm test -- --grep "end-to-end scenarios"

# one group, or one case
npm test -- --grep "S - streaming"
npm test -- --grep "HO4"

# whole package
npm test
```

The suites that load the real SDK share one instrumentation and exporter from
`test/agents-harness.ts`. The instrumentation registers itself in the SDK's global
trace processor list, so a second instance would replace the first and silently
starve it of spans — add new real-SDK suites to that harness rather than
constructing another `OpenAIAgentsInstrumentation`.

To record the one cassette-backed test (HO1) against the real API:

```bash
OPENAI_API_KEY=sk-... NOCK_BACK_MODE=record \
  npm test -- --grep "preserves the span hierarchy"
```
