# Migration Report: `@opentelemetry/instrumentation-llama-index`

**Tracking Issue**: [#3668](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3668)  
**Target Package**: `@opentelemetry/instrumentation-llama-index` (`packages/instrumentation-llama-index`)  
**Mode**: Greenfield Migration  
**Source Package**: `@arizeai/openinference-instrumentation-llama-index`  

---

## 1. Native Instrumentation Investigation
- Checked `llamaindex` and `@llamaindex/core`. Neither library contains native OpenTelemetry dependencies or emits standard GenAI semantic conventions.
- Only workflow-specific middleware (`@llamaindex/workflow-otel`) exists for event-driven workflows, leaving core LlamaIndex querying, document retrieval, and embedding generation uninstrumented.
- A dedicated `@opentelemetry/instrumentation-llama-index` package is required to provide auto-instrumentation for LlamaIndex.TS applications.

---

## 2. Operation & Semantic Convention Mapping

| Operation | Target Component | Span Name | OpenTelemetry GenAI Semantic Conventions |
| :--- | :--- | :--- | :--- |
| **Workflow / Query** | `RetrieverQueryEngine.prototype.query` | `invoke_workflow RetrieverQueryEngine` | `gen_ai.operation.name: 'invoke_workflow'`<br>`gen_ai.workflow.name: 'RetrieverQueryEngine'`<br>`gen_ai.input.messages` (opt-in)<br>`gen_ai.output.messages` (opt-in) |
| **Retrieval** | `BaseRetriever.prototype.retrieve` | `retrieval` | `gen_ai.operation.name: 'retrieval'`<br>`gen_ai.retrieval.query.text`<br>`gen_ai.retrieval.top_k`<br>`gen_ai.retrieval.documents` (opt-in) |
| **Embeddings** | `BaseEmbedding.prototype.getQueryEmbedding` | `embeddings {model}` | `gen_ai.operation.name: 'embeddings'`<br>`gen_ai.provider.name: 'llamaindex'`<br>`gen_ai.request.model`<br>`gen_ai.embeddings.dimension.count` |
| **Error Handling** | All methods | Same | `error.type`<br>`status.code: ERROR`<br>`recordException(error)` |

---

## 3. Privacy & Content Capture (Opt-in)
- In compliance with Non-negotiable Rule 6, **content capture is disabled by default** (`captureContent: false`).
- Users can enable content capture via:
  - Configuration: `new LlamaIndexInstrumentation({ captureContent: true })`
  - Environment variable: `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` or `span_only`
- When disabled, prompt text, response text, and document text are omitted from span attributes, recording only operation names, workflow names, document IDs, metadata, and scores.

---

## 4. Dependencies Review
- **Zero OpenInference Dependencies**:
  - All `@arizeai/openinference-*` packages removed.
  - Verification check: `Select-String -Pattern '@arizeai|openinference'` returns 0 matches.
- Uses official `@opentelemetry/api`, `@opentelemetry/core`, `@opentelemetry/instrumentation`, and `@opentelemetry/semantic-conventions`.

---

## 5. Validation Results
- **TypeScript Compilation**: `tsc -p .` clean (exit code 0).
- **Unit Tests**: 16 passing tests (Mocha + `@opentelemetry/contrib-test-utils`).
- **Code Coverage**:
  - Statements: 98.55%
  - Lines: 98.96%
  - Functions: 100%
  - Branches: 81.94%
- **ESLint**: 0 errors, 0 warnings.
- **Prettier**: 100% formatted.
- **Monorepo Tools**:
  - `scripts/check-release-please.mjs`: `OK`
  - `scripts/lint-readme.js`: `OK`
  - `scripts/gen-component-label-map.mjs`: Updated `.github/component-label-map.yml`.
