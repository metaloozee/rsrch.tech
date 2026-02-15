# Modernization & Upgrade Plan (rsrch.tech)

## 1) Current-state findings

### Runtime and framework
- The app is on **Next.js 15.3.0** + **React 19** + **TypeScript 5**, with `reactCompiler` enabled in `next.config.ts`.
- Package management is now standardized on `bun` (`package.json` + `bun.lock` + README commands), removing prior manager drift.

### AI stack and routing patterns
- The active chat route (`src/app/api/chat/route.ts`) now uses centralized provider/model selection from `src/lib/ai-models.ts` with Mistral-first defaults and env-driven overrides.
- A deprecated route (`route-old.ts`) still contains older AI SDK patterns and Mistral setup (`mistral-small-latest`, `mistral-large-latest`) and should be either migrated or removed to avoid drift.
- Current server orchestration is custom and prompt-heavy (plan → Tavily searches → per-goal analysis → report synthesis). This is functionally good, but should be refactored into composable units and typed contracts to support SDK/API upgrades safely.

### Implemented in current modernization pass
- Package manager standardized to Bun (`packageManager: bun@1.2.14`) and Bun-based verification scripts added.
- AI route request payload now uses zod `safeParse` validation to return a deterministic `400` on malformed requests.
- Added model fallback execution for planning and analysis stages (`runWithFallback` + `getModelCandidates`).
- Dependency ranges refreshed for key AI/runtime packages where newer compatible releases are available.

### Config & environment health
- Env schema requires `GROQ_API_KEY`, but active route does not require Groq in practice. This can block deployment unnecessarily.
- No explicit CI/test pipeline is defined in `package.json` beyond lint.

### Dependency posture (high-level)
- AI SDK packages are on older 1.x lines (`@ai-sdk/*` and `ai` 4.x), likely missing newer API ergonomics and provider features.
- UI ecosystem includes current-generation Radix + Tailwind v4 styles, but should still be batch-upgraded with strict lockfile refresh and smoke testing.

---

## 2) Research summary: what to modernize now

> Note: this environment blocks direct outbound access to npm/docs endpoints, so exact latest version numbers must be resolved in-step during execution (`bun outdated`, `bun update`).

### A. Upgrade patterns to follow for Next.js + React + TS
1. **Single package manager policy** (recommend `bun`) and deterministic lockfile updates.
2. **Route handler hardening**:
   - split orchestration into `services/research/*` modules;
   - type all tool payloads with zod contracts reused by both generation and runtime validation;
   - isolate prompts in versioned template files.
3. **Progressive migration to Server Components-first boundaries**:
   - keep heavy compute in route handlers;
   - keep interactive chat in client components only.
4. **Observability-first AI features**:
   - add request IDs + trace-level logs for each pipeline stage;
   - persist model/provider metadata in responses for debugging.
5. **Resilience defaults**:
   - retry + fallback model chain;
   - timeout budgets per stage;
   - circuit-breaker behavior on search provider failures.

### B. Mistral model strategy (target architecture)
Use a capability-tiered mapping instead of hardcoding a single model:
- **Fast planner**: latest low-latency Mistral chat model.
- **Reasoning/synthesis**: latest higher-quality Mistral flagship model.
- **Embeddings** (future history/search): Mistral embedding model.
- **Optional multimodal** (if product roadmap needs it): Mistral vision-capable model.

Implementation pattern:
- Model aliases in config (`MODEL_PLAN`, `MODEL_ANALYSIS`, `MODEL_REPORT`) mapped via env;
- health-check endpoint validates configured model IDs at startup;
- provider fallback list: Mistral primary, OpenRouter secondary (optional), Google tertiary (optional).

### C. AI SDK modernization direction
1. Consolidate on **current Vercel AI SDK APIs** and remove deprecated options.
2. Use a shared model factory (`lib/ai/models.ts`) so provider/model switches are centralized.
3. Normalize stream/event annotations into typed discriminated unions used by UI renderer.
4. Introduce guardrails around tool calling:
   - strict zod schemas;
   - max tool iterations;
   - error taxonomy (`VALIDATION_ERROR`, `UPSTREAM_TIMEOUT`, `NO_RESULTS`, etc.).

---

## 3) Comprehensive project-wide upgrade plan

## Phase 0 — Baseline and safety (Day 0)
1. Freeze baseline:
   - create `upgrade/base` branch snapshot;
   - export current Lighthouse and API latency numbers.
2. Add verification scripts:
   - `typecheck`, `lint`, `build`, and one API smoke test command.
3. Define rollback:
   - tagged release before dependency bump.

**Exit criteria**: reproducible baseline metrics and green checks on current branch.

## Phase 1 — Dependency refresh with minimal behavior change (Day 1-2)
1. Standardize on `bun` in docs/scripts.
2. Run controlled upgrades:
   - core: `next`, `react`, `react-dom`, `typescript`, `@types/*`;
   - AI: `ai`, `@ai-sdk/react`, `@ai-sdk/mistral`, other providers;
   - UI/utilities: Radix, motion, form libs, zod.
3. Fix compile breaks only (no logic changes yet).
4. Regenerate lockfile and run full checks.

**Exit criteria**: no functional regressions, all checks green.

## Phase 2 — AI runtime refactor (Day 2-4)
1. Extract orchestration from `route.ts` into modules:
   - `plan-goals.ts`
   - `search-goals.ts`
   - `analyze-goals.ts`
   - `compose-report.ts`
2. Introduce `lib/ai/models.ts` with env-driven aliases.
3. Add fallback chain and per-stage timeout/retry policy.
4. Remove or archive `route-old.ts` after parity validation.

**Exit criteria**: identical UX, cleaner architecture, better reliability.

## Phase 3 — Mistral-first configuration + model rollout (Day 4-5)
1. Switch default models to Mistral aliases.
2. Keep provider fallback toggles behind env flags.
3. Add startup validation for all configured model names.
4. Run eval set (20–50 prompts) comparing:
   - citation quality,
   - factual consistency,
   - latency,
   - cost/request.

**Exit criteria**: Mistral-first path meets quality and latency SLO.

## Phase 4 — Product and platform hardening (Day 5-7)
1. Add telemetry (stage timings, failures by class, provider/model usage).
2. Add persistence-ready abstractions for future chat history.
3. Add rate limiting and abuse controls on `/api/chat`.
4. Add CI workflow: lint, typecheck, build, smoke tests.

**Exit criteria**: deploy-safe and observable production posture.

---

## 4) Concrete work items by file

1. **`src/app/api/chat/route.ts`**
   - Replace inline pipeline with imported service functions;
   - keep API contract stable for frontend.
2. **`src/app/api/chat/route-old.ts`**
   - Remove after parity, or move to `docs/legacy/` with deprecation note.
3. **`src/lib/env.ts`**
   - Make provider keys conditional by enabled provider;
   - add model alias env vars and validation.
4. **`README.md`**
   - Update setup steps to chosen package manager;
   - add upgrade notes and model configuration section.
5. **`package.json`**
   - add scripts: `typecheck`, `test:smoke`, `check`.

---

## 5) Risk register and mitigations

1. **Model ID churn / deprecations**
   - Mitigation: alias-based model config + startup validation endpoint.
2. **SDK breaking changes in streaming/tool calls**
   - Mitigation: typed adapter layer and integration tests for annotations.
3. **Search provider instability**
   - Mitigation: retries, backoff, and graceful partial-result reporting.
4. **Prompt regressions after refactor**
   - Mitigation: frozen eval prompt set and snapshot-based output checks.

---

## 6) Suggested execution checklist (copy/paste)

```bash
# 1) baseline
bun install --frozen-lockfile
bun run lint
bun run build

# 2) discover versions (environment permitting)
bun outdated

# 3) batch upgrade
bun update

# 4) verify
bun run lint
bun run typecheck
bun run build

# 5) optional: minimal smoke test
bun run dev
# then POST /api/chat with sample payload
```

---

## 7) Decision proposal

- Adopt **Mistral-first** provider strategy with env-based model aliases and fallback providers.
- Execute upgrades in **four controlled phases** (dependency refresh → AI refactor → model rollout → hardening).
- Gate every phase with measurable checks (build, latency, quality eval set, error rate).

This plan is designed to modernize the stack without interrupting current behavior and to keep the app deployable throughout the migration.
