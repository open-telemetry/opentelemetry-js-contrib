# PR #3872 — November 9, 2026 review response (candidate branch)

## Snapshot

| Item | Value |
|------|--------|
| **Upstream PR** | https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872 |
| **PR head at start of work** | `0283aa337691789dbaea99cbfc1900c35a848dbb` (`cursor/instrumentation-openai-genai-util-20f0`) |
| **Candidate branch** | `review/nov9-maintainer-feedback` (fork only; **PR branch not updated**) |
| **Reference draft** | [psx95/opentelemetry-js-contrib#9](https://github.com/psx95/opentelemetry-js-contrib/pull/9) (`refactor-openai` @ `0cc60497`) — used as structural reference, not copied blindly |
| **Maintainer review** | [pullrequestreview-5822303045](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#pullrequestreview-5822303045) |

## Files changed (vs `origin/main`)

```
package-lock.json
packages/genai-util/CHANGELOG.md
packages/genai-util/README.md
packages/genai-util/src/index.ts
packages/genai-util/src/utils.ts
packages/instrumentation-openai/CHANGELOG.md
packages/instrumentation-openai/README.md
packages/instrumentation-openai/package.json
packages/instrumentation-openai/src/instrumentation.ts
packages/instrumentation-openai/src/internal-types.ts
packages/instrumentation-openai/src/responses.ts
packages/instrumentation-openai/src/types.ts
packages/instrumentation-openai/src/utils.ts
packages/instrumentation-openai/test/load-instrumentation.ts
packages/instrumentation-openai/test/openai.test.ts
packages/instrumentation-openai/test/utils.test.ts
scripts/verify-pack.mjs
```

**Note:** `packages/genai-util/src/stream.ts` no longer differs from `main` (OpenAI-specific `iterator()` / `tee()` wrapping removed from genai-util).

## Review comment → resolution

| Topic | GitHub link | Resolution |
|-------|-------------|------------|
| Lifecycle: let invocations own span/metric attrs | [Review §1](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#pullrequestreview-5822303045) | Removed manual `metricAttributes` / duplicate `extraAttrs` request fields; `startInference` / `startEmbedding` pass `requestOptions`, `serverAddress`/`serverPort`, and minimal OpenAI-only `attributes` (e.g. `gen_ai.output.type`). |
| Conditional content capture | [Review §1](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#pullrequestreview-5822303045), [r4512658958](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#discussion_r4512658958) | `inputMessages` / outputs built only when `handler.shouldCaptureContent()` / `invocation.shouldCaptureContent()` is true. |
| Multimodal `MessagePart` schemas | [Review §2](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#pullrequestreview-5822303045) | `extractChatInputMessages` / Responses converters map to `UriPart`, `BlobPart`, `FilePart` with `modality: image` (and audio/file paths). **See privacy risks below.** |
| Token modality accounting | [Review §2](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#pullrequestreview-5822303045) | `extractChatTokenUsage` / `extractResponsesTokenUsage` set totals only; optional `audio` in `tokenUsageByModality` when explicit; `inferMissingModalityCounts` in genai-util handles the rest. |
| Remove prompt log-event capture | [r4512747533](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#discussion_r4512747533) | Removed `gen_ai.user.message`, `gen_ai.choice`, and related `logger.emit` paths from chat/responses instrumentation. |
| OpenAI stream code out of genai-util | [r4511067648](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#discussion_r4511067648) | `_attachStreamTelemetry` in `instrumentation.ts` wraps OpenAI `Stream.iterator()` via `TelemetryHandler.wrapAsyncStream`; genai-util `stream.ts` reverted to generic wrapper. |
| Redundant attrs / requestOptions | [r4512562527](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#discussion_r4512562527), [r4512591108](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#discussion_r4512591108) | Addressed by simplified `startInference` options (see lifecycle row). |
| Empty `_updateMetricInstruments` | [r4512282625](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#discussion_r4512282625) | Override removed (metrics owned by `TelemetryHandler`). |
| Duplicate capture normalization | [r4510791228](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#discussion_r4510791228) | Single `resolveCaptureMode()` in `utils.ts`; handler uses `contentCaptureMode` directly. |
| Avoid exporting `getErrorType` | [r4510641473](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#discussion_r4510641473) | Removed from `genai-util` public `index.ts`; OpenAI uses local `getOpenAIErrorType()`. |
| `gen_ai.provider.name` must be `openai` | [r4424591966](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#discussion_r4424591966) | `providerName` fixed to `GEN_AI_PROVIDER_NAME_VALUE_OPENAI` for all operations. |
| Drop boolean `captureMessageContent` | [r4509977932](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#discussion_r4509977932) | **Partial:** TypeScript config is `ContentCaptureMode` only; `resolveCaptureMode()` still accepts legacy boolean **values** and env `true`/`false` strings. **Awaiting @hectorhdzg** on breaking change. |

## Tests (Node v24.11.1)

| Command | Result |
|---------|--------|
| `npx nx run @opentelemetry/genai-util:test` | **174 passing** |
| `npx nx run @opentelemetry/instrumentation-openai:test` (Node 24.11.1) | **50 passing, 23 pending** (Responses suites skipped when OpenAI SDK &lt; 4.87.0 in matrix node); **73 total `it()` cases** (44 `openai.test.ts` + 29 `utils.test.ts`) |
| `npx nx run @opentelemetry/instrumentation-openai:compile` | **OK** |
| `npx nx run @opentelemetry/instrumentation-openai:lint` | **0 errors** |
| `npx nx run @opentelemetry/genai-util:lint` | **0 errors**, 1 warning (pre-existing unused var in stream.test.ts) |
| `npm run lint:readme` (instrumentation-openai) | **OK** |
| `npx tsc --noEmit -p packages/instrumentation-openai` | **OK** |
| `npm run test-all-versions` (instrumentation-openai) | **OK** (openai 4.19–6.x matrix; Responses tests pending on older SDKs as before) |
| GenAI semantic-conventions conformance runner | **Not run** (no conformance target in instrumentation-openai; only langchain package has `test:conformance`) |

## Test count audit (PR head `0283aa33` → `review/nov9-maintainer-feedback`)

### Measured counts

| Suite | PR branch `0283aa33` | Review branch (this work) |
|-------|----------------------|---------------------------|
| `openai.test.ts` `it()` count | 43 | **44** (+1 privacy default-off integration) |
| `utils.test.ts` `it()` count | 31 | **29** (−2 net vs psx95 swap, +4 restored edge-case tests in this verification pass) |
| **Nx reported total** (earlier run on PR head) | **74 passing** | **73 `it()`**; **50 passing + 23 pending** on current dev run |

The “82 → 69” figure from an earlier session maps to **suite-level rewrites**: the Nov 9 refactor replaced the prior PR’s bespoke `utils.test.ts` (provider heuristics, `setUsageDetailAttributes`, `formatChatMessageContent` / `[image]` placeholder) with psx95-style mapping helpers. **`openai.test.ts` titles are unchanged** except for the added default-off multimodal span test.

### Removed `utils.test.ts` tests (intentional / replaced)

| Removed test (PR `0283aa33`) | Disposition |
|------------------------------|-------------|
| `getProviderNameFromBaseURL` host heuristics (Bedrock, Azure, fireworks, malformed URL) | **Replaced:** OpenAI semconv requires `gen_ai.provider.name = openai` always; asserted on spans in `openai.test.ts` (`ATTR_GEN_AI_PROVIDER_NAME`). |
| `setUsageDetailAttributes` (cache/reasoning span attrs) | **Replaced:** `extractChatTokenUsage` / `extractResponsesTokenUsage` + `InferenceInvocation.setUsage` + genai-util end hooks. |
| `formatChatMessageContent` (text/refusal join, `[image]` placeholder, signed URL never in string) | **Replaced:** `extractChatInputMessages` + `parseUriOrBlobPart` (schema parts). **Privacy model changed** — see privacy section. |
| Usage detail omission tests (zero/negative/non-finite) for deprecated helper | **Restored (partial):** `extractChatTokenUsage omits zero and negative usage detail fields`. |

### Added / retained regression coverage (review branch)

| Test | Coverage |
|------|----------|
| All prior `openai.test.ts` scenarios (chat, stream, tee, withResponse, embeddings, responses, metrics) | **Retained** (psx95 fixture suite). |
| `does not expose multimodal parts on span when capture is off` | **New** — signed `image_url` absent from span when default `none`. |
| `parseUriOrBlobPart preserves signed URL query strings` | **New** — documents exposure **when** `span_only` maps messages. |
| `maps chat input_audio base64 to audio BlobPart bytes` | **New** — audio payload path. |
| `extractChatTokenUsage` audio modality + zero/negative omission | Token modality per review. |
| Lifecycle streaming | `tee`, double iteration, withResponse, stream usage, `assertInferenceMetrics` unknown modality — **unchanged**. |

### Lost assertion coverage (gap unless maintainers agree on privacy policy)

| Former assertion | Status |
|------------------|--------|
| Image parts never appear as raw URLs even when capture on (`[image]` placeholder) | **Not restored** — conflicts with schema-first `UriPart.uri`; **blocked on maintainer decision** before redaction helper. |
| No per-message log events | **Still removed** (per review); no replacement conformance tests in this package. |

## Multimodal privacy assessment

### When sensitive data can enter telemetry

| Capture mode | Chat Completions | Responses API |
|--------------|------------------|---------------|
| **`none` (default)** | No `gen_ai.input.messages` / `gen_ai.output.messages`; multimodal parts not constructed (`inputMessages` undefined). Integration test asserts signed URL absent from span JSON. | Same; `records multimodal input` asserts `ATTR_GEN_AI_INPUT_MESSAGES` undefined. |
| **`span_only`** | `extractChatInputMessages` → `image_url` → `parseUriOrBlobPart`: **full `https?://` URI** (including query = signed URLs) in `UriPart`; **`data:...;base64,...`** → **`BlobPart.content` raw bytes**; `input_audio.data` → **audio `BlobPart`**; `file.file_id` → `FilePart` (id only); `file.file_data` / URLs → parseUriOrBlobPart. | `convertResponsesMessageParts`: `input_image.image_url`, `input_file.file_url` / `file_data`, `input_audio` → same helpers (`responses.ts` ~182–234). Serialized JSON on span at inference end. |
| **Logs / events** | Deprecated `gen_ai.*.message` / `gen_ai.choice` **removed** — no log sink for prompts. | Operation-details log paths **removed** with lifecycle refactor. |

### Privacy-preserving approach (proposed, **not implemented** — no behavior change pending agreement)

Compatible with genai-util schemas without expanding sensitive payloads:

1. **`UriPart`:** set `uri` to **scheme + host + path only** (strip query/fragment); or `uri: ''` with optional `generic` metadata `{ "redacted": true }` if semconv allows extension fields.
2. **`BlobPart`:** for `data:` URIs, emit **`BlobPart` with empty `content`** and `mime_type` only, or a fixed-size hash attribute outside message JSON if required later.
3. **`FilePart`:** keep **`file_id` only** (no `file_data` expansion) — already preferred when ID present.
4. Document in README that **`span_only` is not safe for production** without an approved redaction policy.

Current code **does not** implement (1)–(2) so as not to silently weaken maintainer-requested schema fidelity.

## PR #3872 review activity (checked 2026-11-10)

- **No new inline comments** from @psx95 after [review 5822303045](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#pullrequestreview-5822303045) (2026-11-09).
- **Boolean `captureMessageContent`:** [@psx95](https://github.com/psx95) requested dropping boolean support ([discussion r4509977932](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#discussion_r4509977932)), **cc @hectorhdzg** (component owner) — **no owner reply on thread yet**. Review branch: `OpenAIInstrumentationConfig.captureMessageContent` is **`ContentCaptureMode` only**; `resolveCaptureMode()` still maps runtime `true`/`false` and env `true`/`false` strings for transition.

## Remaining risks

1. **Multimodal privacy (needs maintainer confirmation):** With `captureMessageContent: 'span_only'`, `parseUriOrBlobPart` records **full HTTPS URLs** in `UriPart` and **decoded bytes** from `data:` URIs in `BlobPart`. This replaces the prior `[image]` text placeholder and may expose signed URLs or base64 payloads. Recommend agreeing on redaction (e.g. scheme+host only, or omit `uri` for http(s)) before merge.
2. **Release order:** `instrumentation-openai` depends on `@opentelemetry/genai-util@^0.5.0` with expanded exports; release-please / publish order must ship genai-util first (existing CHANGELOG note).
3. **genai-util export surface:** Public exports realigned to type-only surface (per maintainer draft); langchain still uses `TelemetryHandler` + `export *` semconv — verify downstream in CI.

## Unresolved maintainer decisions

1. **Boolean `captureMessageContent`:** Dropped from the **TypeScript config type**; env string `true`/`false` still supported. Full breaking removal of boolean runtime values pending component-owner input ([@hectorhdzg](https://github.com/hectorhdzg) per [r4509977932](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3872#discussion_r4509977932)).
2. **Multimodal URI/blob capture policy** when content capture is enabled (see risk §1).

## AI disclosure

AI assistance was used while drafting this change and structuring the response to [@psx95](https://github.com/psx95)'s review.

## Recommendation

| | |
|--|--|
| **Update PR #3872 branch now?** | **GO with conditions** — technical feedback is addressed and tests are green on `review/nov9-maintainer-feedback`, but confirm multimodal privacy policy and boolean-config consensus with maintainers before fast-forwarding `cursor/instrumentation-openai-genai-util-20f0`. |
| **Merge PR?** | **NO-GO** until maintainer re-review, fork CI (if `action_required`), and privacy decision. |

---

**Candidate branch tip:** `review/nov9-maintainer-feedback` @ `ab0fb6db4fe76b11dfe5690643911dbff7a1de75` (tests+audit); preceding refactor @ `d64172e6ec4977c5b2f3bc2aa21f0859d1f8d176`
