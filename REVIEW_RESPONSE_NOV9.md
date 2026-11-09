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
| `npx nx run @opentelemetry/instrumentation-openai:test` | **69 passing** |
| `npx nx run @opentelemetry/instrumentation-openai:compile` | **OK** |
| `npx nx run @opentelemetry/instrumentation-openai:lint` | **0 errors** |
| `npx nx run @opentelemetry/genai-util:lint` | **0 errors**, 1 warning (pre-existing unused var in stream.test.ts) |
| `npm run lint:readme` (instrumentation-openai) | **OK** |
| `npx tsc --noEmit -p packages/instrumentation-openai` | **OK** |
| `npm run test-all-versions` (instrumentation-openai) | **OK** (openai 4.19–6.x matrix; Responses tests pending on older SDKs as before) |
| GenAI semantic-conventions conformance runner | **Not run** (no conformance target in instrumentation-openai; only langchain package has `test:conformance`) |

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

**Candidate branch:** `review/nov9-maintainer-feedback` — see `git rev-parse HEAD` on that branch for the tip SHA after checkout.
