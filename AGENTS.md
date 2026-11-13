# AI Agent Guidelines & Engineering Contract

Welcome AI Agent! You are maintaining or extending **Mnema**, a high-performance personal knowledge library and read-it-later application built for **Cloudflare Workers Free Tier** and **React 19 PWA**.

Before writing, refactoring, or reviewing code, you **MUST** read and adhere to the master engineering policy:
👉 **[`docs/ENGINEERING_POLICIES_AND_GUIDELINES.md`](./docs/ENGINEERING_POLICIES_AND_GUIDELINES.md)**

---

## ⚡ Quick Reference for AI Agents

### 1. Monorepo Organization & Directory Roles
- **`packages/shared/`**: Single source of truth for domain types, DTO interfaces, and platform-neutral utilities. If a type or schema is used across packages, define it here (`packages/shared/src/types.ts`).
- **`apps/api/src/core/`**: Platform infrastructure and security primitives (`urlSafety.ts`, `apiKeyAuth.ts`, `sanitizeHtml.ts`, `settings.ts`, `helpers.ts`, `text.ts`). Never import `features/*` from `core/`.
- **`apps/api/src/features/`**: Domain feature slices (`ai/`, `capture/`, `integrations/`, `library/`, `mcp/`, `review/`). Maintain strict domain isolation. Do not cross-import private internals between features.
- **`apps/web/src/services/api/`**: Client abstraction layer (`sources.ts`, `highlights.ts`, `reviews.ts`, `ai.ts`, `integrations.ts`). Never use raw `fetch()` in React components; route through `api.*`.
- **`apps/extension/`**: Chrome Extension communicating with `/api/import/json` and `/api/highlights`.

### 2. Mandatory Security Guardrails (Zero Compromise)
- **SSRF Defense**: **NEVER** use native `fetch()` for user-provided or external URLs. You **MUST** use `safeFetch` or `assertSafeExternalUrl` from `apps/api/src/core/urlSafety.ts`. Blocks private IPs, loopback, link-local metadata (169.254.169.254), and inspects every redirect hop.
- **API Authentication**: Enforced via `apiKeyMiddleware` in `apps/api/src/core/apiKeyAuth.ts`. Checks `X-Api-Key` (SHA-256 hashed in D1), OAuth 2.1 Bearer tokens, or Cloudflare Access JWT. Read-only keys must be rejected with 403 on mutating requests. Fail-closed when `REQUIRE_API_KEY=true`.
- **HTML Sanitization**: All incoming HTML (`content_html`) must be sanitized using `sanitizeHtml` (`apps/api/src/core/sanitizeHtml.ts`) before database storage. Never allow `<script>`, `<svg onload>`, `onerror`, or `javascript:` schemes.
- **Secret Masking**: Third-party credentials in `user_settings` (`resend_api_key`, `telegram_bot_token`, etc.) must be returned masked via `toPublicSettings()` (`apps/api/src/core/settings.ts`). Updates must be write-only (never overwrite secrets with `••••`).
- **Security Headers & CSP**: Dynamic host-aware CSP is set globally in `apps/api/src/index.ts`. Frame-ancestors are denied; nosniff and frame options DENY are mandatory.

### 3. Cloudflare Workers Free Tier Constraints
- **10ms CPU Execution Limit**: Heavy CPU tasks will abort the worker. In RSS feeds (`apps/api/src/features/capture/rss.ts`), use regex-based item slicing (`extractBlocks` with `maxItems = 30`), and cap cron synchronizations (`maxFeedsPerRun = 4`, fetch budget 15). Defer non-critical work to `ctx.waitUntil`.
- **Workers AI Daily Neuron Budget**: Capped at `WORKERS_AI_DAILY_LIMIT = 8500` (safe limit below 10,000 neurons/day Free Tier). Tracked via KV. When exhausted or unavailable, semantic vector generation **MUST** seamlessly fall back to `local_trigram` (256-dim FNV-1a ASCII n-gram vectorizer). It must never throw or break search.
- **Gemini API Error Propagation**: Rotate across `GEMINI_TEXT_MODELS` (`gemini-3.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.0-flash`). If 404, fall back to next model. If 400/403/429, capture and propagate the error message to the client.
- **D1 Migrations (`0001`–`0011`)**: Schema updates in `apps/api/migrations/` must be sequential, additive, and non-destructive. **NEVER** drop or truncate tables containing user data (`sources`, `highlights`, `tags`, `shelves`, `user_settings`, `api_keys`). Use `ALTER TABLE ADD COLUMN` with nullability or defaults, and `IF NOT EXISTS`.
- **R2 Daily Backups**: Daily snapshots are stored in `EPUB_BUCKET` under `backups/mnema-backup-YYYY-MM-DD.json`. Runs are idempotent (`head()` check) and deferred via `ctx.waitUntil`.

### 4. Verification Policy
Whenever you introduce or modify API routes, authentication logic, or data models, you must run:
```bash
# 1. Monorepo Build and TypeScript Check
npm run build

# 2. Mandatory Security Audit Suite (MUST PASS 100%)
npm --workspace=apps/api test
# or: node apps/api/tests/test_security_audit.mjs

# 3. Comprehensive Parity & In-Process Tests
node apps/api/tests/run_inprocess_tests.mjs
```
Do not weaken or delete existing test assertions to make tests pass.
