# LangChain GenAI conformance

This directory contains upstream
[`open-telemetry/semantic-conventions-conformance`](https://github.com/open-telemetry/semantic-conventions-conformance)
scenarios for the local `@opentelemetry/instrumentation-langchain` migration.
The programs use only public LangChain SDK APIs, deterministic in-process
models/tools, and OTLP export to Weaver; they never call model networks.

## Coverage

- `RunnableSequence.invoke` and `.stream` as `invoke_workflow` INTERNAL spans.
- `RunnableMap.invoke` as an `invoke_workflow` INTERNAL span.
- `DynamicTool.call` and `DynamicStructuredTool.invoke` as `execute_tool`
  INTERNAL spans, including tool-call IDs, JSON arguments/results, and original
  error preservation.
- `createAgent` `ReactAgent.invoke` and `.stream` as `invoke_agent` INTERNAL
  spans using a deterministic `BaseChatModel` subclass with `bindTools`.
- Content capture disabled by default and enabled through both
  `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` and
  `{ captureMessageContent: true }`.
- Nested sequence streaming, suppression inside stream producers, configured
  agent conversation IDs and descriptions, and dynamic-model attribution.
- Direct compiled LangGraph invocation, complete-state streaming, update-only
  streaming and error handling, without duplicate internal adapter spans.
- Framework-owned memory vector store retrieval, including similarity scores,
  MMR, content opt-in and original error preservation.

No delegated provider inference/retrieval, prompt, or metric expectations are
declared.

## Conformance expectations

Agent scenarios supply generated usage/finish metadata through the public SDK
model response. They verify invocation-local aggregate token usage and finish
reasons, with content capture independently off and on.

The four in-memory retrieval scenarios declare one narrowly scoped expected
violation: `genai_expected_attribute_missing` for `server.address` on operation
`retrieval`. MemoryVectorStore has no network endpoint, but the upstream client
retrieval policy expects one. No fabricated address is emitted and no upstream
policy is changed. The runner also fails if this expected finding disappears.
All other missing spans, attributes and convention violations fail.

`graph_updates` explicitly expects no output content: updates do not expose the
complete reduced state. The instrumentation must not replay user reducers or
claim that a partial update is the final output.

## Pinned tooling

Keep tools outside the workspace. Choose a tooling directory, for example:

```powershell
$Tools = 'C:\otel-conformance-tools'
New-Item -ItemType Directory -Force $Tools | Out-Null

git -c core.longpaths=true clone --filter=blob:none --sparse https://github.com/open-telemetry/semantic-conventions-conformance "$Tools\semantic-conventions-conformance"
git -C "$Tools\semantic-conventions-conformance" sparse-checkout set tools/runner tools/gen-ai
git -C "$Tools\semantic-conventions-conformance" checkout f8c9b1b55e34e4cea362260626b5a478a7245b09

git clone --filter=blob:none https://github.com/open-telemetry/semantic-conventions-genai "$Tools\semantic-conventions-genai"
git -C "$Tools\semantic-conventions-genai" checkout c88d504ab3d9879f8e50d3cc87e69775e11db234

py -3.12 -m venv "$Tools\.venv"
& "$Tools\.venv\Scripts\python.exe" -m pip install --upgrade pip
& "$Tools\.venv\Scripts\python.exe" -m pip install `
  -e "$Tools\semantic-conventions-conformance\tools\runner" `
  -e "$Tools\semantic-conventions-conformance\tools\gen-ai\mock-server" `
  -e "$Tools\semantic-conventions-conformance\tools\gen-ai\runner"
```

Install Weaver `v0.26.1` in `$Tools\weaver` and put both tools on `PATH`:

```powershell
$WeaverZip = "$Tools\weaver-x86_64-pc-windows-msvc.zip"
Invoke-WebRequest `
  -Uri https://github.com/open-telemetry/weaver/releases/download/v0.26.1/weaver-x86_64-pc-windows-msvc.zip `
  -OutFile $WeaverZip
New-Item -ItemType Directory -Force "$Tools\weaver" | Out-Null
Expand-Archive -Path $WeaverZip -DestinationPath "$Tools\weaver" -Force

$env:Path = "$Tools\.venv\Scripts;$Tools\weaver;$env:Path"
weaver --version
genai-conformance --help
```

## Run

Build the parent package first so the scenario imports
`packages\instrumentation-langchain\build\src`:

```powershell
npm run compile -w @opentelemetry/instrumentation-langchain
npm run conformance --prefix packages\instrumentation-langchain\test\conformance -- `
  --registry "$Tools\semantic-conventions-genai\model"
```

For one scenario:

```powershell
npm run conformance --prefix packages\instrumentation-langchain\test\conformance -- `
  --registry "$Tools\semantic-conventions-genai\model" `
  --scenario workflow_content_on --report-only
```

## Package integration

The parent package declares the OTel SDK, context manager and OTLP exporter test
dependencies. From the repository root, the package script forwards arguments
to the upstream runner:

```powershell
npm run test:conformance -w @opentelemetry/instrumentation-langchain -- `
  --registry "$Tools\semantic-conventions-genai\model"
```

`data.json` is generated by a complete upstream run. Raw reports in `output`
remain ignored and should be reviewed before sharing.

## Real Collector integration

With Docker running and the package compiled:

```sh
npm run test:collector -w @opentelemetry/instrumentation-langchain
```

This opt-in test starts the official Collector Contrib 0.161.0 image pinned by
digest, exports the scenario telemetry over OTLP/gRPC, and asserts on the
Collector's JSON file output. It binds only loopback ephemeral host ports and
stops the container after the run. Evidence is retained on failure; successful
temporary output is removed. No model-provider credentials or network calls
are used. Collector acceptance does not replace Weaver semantic validation.
