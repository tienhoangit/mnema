# Mnema Engineering Policies & Maintenance Guidelines

> **Authority & Scope:** This document defines the authoritative architectural rules, security guardrails, Cloudflare Workers runtime optimization policies, and maintenance procedures for the **Mnema** personal knowledge library. All future AI agents and human contributors maintaining or extending this codebase must adhere strictly to these guidelines.

---

## 1. Monorepo Architecture & Organization Policy

Mnema is structured as an npm workspaces monorepo designed for strict domain separation, modularity, and zero circular dependencies.

```text
mnema/
├── apps/
│   ├── api/            # Cloudflare Worker backend (Hono, D1, KV, Workers AI, R2)
│   ├── web/            # Single-Page Application & PWA (React 19, Vite, Tailwind, TanStack Query)
│   └── extension/      # Manifest V3 Chrome Extension (highlighter, Kindle/X sync)
├── packages/
│   └── shared/         # Universal TypeScript types, domain DTOs, schemas & client-safe utils
└── docs/               # Technical specs, architecture plans, and engineering policies
```

### 1.1 Directory Responsibilities

#### `packages/shared/`
* **Role**: Single source of truth for all cross-package contracts.
* **Responsibilities**:
  - Universal domain models and database row interfaces (`Source`, `Highlight`, `Tag`, `UserSettingsRow`, `PublicUserSettings`, `ReviewAction`, `ReadingStatus`, etc.).
  - Request/Response Data Transfer Objects (DTOs) for API contracts.
  - Pure, environment-agnostic utilities (such as client-safe URL validation in `packages/shared/src/url.ts`).
* **Strict Constraints**:
  - **Zero heavy runtime dependencies**: Only lightweight, platform-neutral logic. Never import Node.js built-ins (`fs`, `crypto`, `net`) or browser-only APIs without conditional guards.
  - Both `apps/api`, `apps/web`, and `apps/extension` import from `@mnema/shared`.

#### `apps/api/src/core/`
* **Role**: Foundational platform infrastructure and security primitives for the Cloudflare Worker runtime.
* **Responsibilities**:
  - `apiKeyAuth.ts`: API key verification, SHA-256 hashing, scope checking, and `apiKeyMiddleware`.
  - `urlSafety.ts`: Server-Side Request Forgery (SSRF) defense (`assertSafeExternalUrl`, `safeFetch`).
  - `sanitizeHtml.ts`: Server-side HTML sanitization using `linkedom` to eliminate XSS vectors.
  - `settings.ts`: System & user settings lifecycle, table initialization, and credential masking.
  - `helpers.ts`: Workers AI daily budget tracking, Gemini API key resolution, timezone offset formatting, tag persistence.
  - `text.ts`: Accent-insensitive text normalization (Vietnamese diacritics stripping).
* **Strict Constraints**:
  - `core/` modules must **never** depend on `features/*`.
  - Infrastructure in `core/` must be generic, reusable, and heavily tested.

#### `apps/api/src/features/`
* **Role**: Domain-driven feature vertical slices.
* **Structure**:
  - `ai/`: AI Copilot, semantic search, vector embeddings (`embeddings.ts`), RAG pipelines, topic discovery.
  - `capture/`: Ingestion pipelines (readability, YouTube transcript extractor, PDF extractor, RSS parser, Kindle/CSV imports).
  - `integrations/`: Third-party services (Telegram bot, Resend email digest/newsletter ingestion, Notion sync, Obsidian zip export, API keys management).
  - `library/`: Core entity CRUD (sources, highlights, tags, shelves, trash bin, library tools, public shares).
  - `mcp/`: Model Context Protocol JSON-RPC 2.0 server (`/api/mcp`) and RFC 8414/RFC 9728 OAuth 2.1 authorization server (`oauth.ts`).
  - `review/`: Spaced repetition engines (SM-2, FSRS 6.0), review queue scheduling, undo log, and reading activity heatmap stats.
* **Strict Constraints**:
  - **Domain Isolation**: Feature routers must not tightly couple or import private internals from sibling feature folders. If logic is shared across features, extract it to `core/` or `packages/shared`.
  - Router mounting occurs exclusively in `apps/api/src/index.ts`.

#### `apps/web/src/services/api/`
* **Role**: Frontend API client abstraction layer, modularized by domain.
* **Structure**:
  - `client.ts`: Canonical `apiFetch` wrapper, handling global session expiration events, CSRF headers, authentication token attachment, and public route exemptions.
  - `sources.ts`, `highlights.ts`, `reviews.ts`, `ai.ts`, `integrations.ts`: Domain-specific API service calls mirroring the backend features.
  - `index.ts`: Unified `api` client export combining all domain services.
* **Strict Constraints**:
  - UI components must **never** perform raw `fetch('/api/...')` calls. All HTTP communication must go through `apps/web/src/services/api/`.
  - Types must be imported from `@mnema/shared`, never redeclared locally inside UI components.

#### `apps/extension/`
* **Role**: Client browser extension interacting with the Mnema API.
* **Responsibilities**:
  - Page content extraction, in-browser text selection highlighting, sync with Kindle/X (Twitter), batch import via `/api/import/json` or `/api/highlights`.
  - Communicates with backend using user-configured API key (`X-Api-Key`).

### 1.2 Dependency Rules & Anti-Patterns
1. **Forbidden: Circular Dependencies**: Circular imports between packages or between API feature directories are strictly prohibited.
2. **Forbidden: Duplicate Type Definitions**: Do not define duplicate TypeScript interfaces in `apps/api` or `apps/web` when they represent domain entities. Add or update them in `packages/shared/src/types.ts`.
3. **Forbidden: UI-Direct Ingestion Logic**: Do not embed heavy extraction algorithms (like raw Readability or PDF stream parsing) directly into React view components. Keep extraction isolated in services (`apps/web/src/services/`) or on the backend worker.

---

## 2. Security Guardrails & Verification Policy

Mnema handles personal reading materials, bookmarks, highlights, and API keys. Security is fail-closed by default.

### 2.1 Server-Side Request Forgery (SSRF) Defense
* **Mandate**: All external HTTP requests initiated by the Worker (such as RSS feed fetching, URL article ingestion, Telegram webhooks, and thumbnail downloads) **must** use `safeFetch` or pass target URLs through `assertSafeExternalUrl` from `apps/api/src/core/urlSafety.ts`.
* **Guardrail Enforcement**:
  - **Protocol Whitelist**: Only `http:` and `https:` schemes are allowed. Schemes like `file:`, `ftp:`, `javascript:`, and `data:` are blocked immediately with an error.
  - **Disallowed Hostnames**: `localhost`, `*.localhost`, `*.local`, and `*.internal` are strictly rejected.
  - **Private & Reserved IP Blocking**:
    - IPv4: Loopback (`127.0.0.0/8`), Private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), Link-local/Cloud Metadata (`169.254.0.0/16`), Zero address (`0.0.0.0/8`).
    - IPv6: Loopback (`::1`), Unspecified (`::`), Unique Local Addresses (`fc00::/7`), Link-Local (`fe80::/10`), and IPv4-mapped IPv6 addresses (`::ffff:127.0.0.1`, `::ffff:169.254.169.254`).
  - **Manual Redirect Following**: `safeFetch` sets `redirect: 'manual'` and re-verifies `assertSafeExternalUrl` on every `Location` header hop (up to 5 redirects) to defeat open-redirect SSRF bypasses.

```typescript
// ✅ REQUIRED PATTERN for outbound HTTP requests
import { safeFetch, assertSafeExternalUrl } from '../core/urlSafety';

const { response, finalUrl } = await safeFetch(rawUrl, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Mnema/2.0' },
});
```

### 2.2 API Authentication Architecture
Mnema supports three authentication modes enforced via `apps/api/src/core/apiKeyAuth.ts`:
1. **Public REST API Keys (`X-Api-Key` or `Authorization: Bearer mnema_live_...`)**:
   - Keys are hashed with SHA-256 before querying D1 (`api_keys.key_hash`). Plaintext keys are never stored.
   - Keys support granular scopes (`read`, `write`, `*`). Any mutating request (`POST`, `PUT`, `PATCH`, `DELETE`) with a read-only key returns `403 Forbidden`.
   - Successful auth updates `last_used_at` asynchronously via `ctx.waitUntil` to avoid adding D1 write latency to the response.
2. **OAuth 2.1 Bearer Tokens (`Authorization: Bearer <token>`)**:
   - RFC 8414 & RFC 9728 compliant for MCP clients (Claude Desktop, Antigravity, etc.).
   - Verified via `verifyOAuthToken(env, token)` stored in KV.
   - Scopes (`read`, `write`) are strictly enforced against request methods and tool calls.
3. **Cloudflare Access Edge JWT (`Cf-Access-Jwt-Assertion`)**:
   - Accepted on protected routes when deployed behind Cloudflare Zero Trust.
4. **Fail-Closed Policy (`REQUIRE_API_KEY=true`)**:
   - When `REQUIRE_API_KEY=true` is set in environment bindings, all `/api/*` requests (except public share links and health checks) must provide valid credentials, returning `401 Unauthorized` otherwise.

### 2.3 HTML Input Sanitization & Stored XSS Defense
* **Backend Sanitization (`apps/api/src/core/sanitizeHtml.ts`)**:
  - Every user-supplied or ingested HTML body (`content_html`) is sanitized before persistence into D1.
  - Drop tags completely with their contents: `<script>`, `<style>`, `<iframe>`, `<frame>`, `<object>`, `<embed>`, `<svg>`, `<math>`, `<template>`, `<form>`, `<input>`, `<button>`.
  - Whitelist formatting tags: `<p>`, `<h1>`–`<h6>`, `<blockquote>`, `pre`, `code`, `ul`, `ol`, `li`, `a`, `strong`, `em`, `img`, `table`, etc.
  - Strip event handlers (`onload`, `onerror`, `onclick`), `javascript:` URIs, and dangerous attributes.
* **Frontend Sanitization (`apps/web`)**:
  - Reader view sanitizes through `DOMPurify.sanitize(html)` with memoization (`useMemo`) to avoid redundant re-parsing during scrolling and text selection.
  - Dynamic links (`<a href>`) must pass through `getSafeHttpUrl()` and specify `rel="noopener noreferrer"`.

### 2.4 Secret Masking & Sensitive Credentials
* **User Settings (`apps/api/src/core/settings.ts`)**:
  - Sensitive third-party tokens (`resend_api_key`, `telegram_bot_token`, `telegram_webhook_secret`, `newsletter_secret`, `notion_token`, `gemini_api_key`) are stored in D1.
  - All public GET endpoints (`/api/email/settings`, `/api/integrations/status`) must return masked secrets via `toPublicSettings()`:
    - Booleans indicate presence: `has_resend_api_key`, `has_telegram_bot_token`, etc.
    - Masked strings for display: `val.slice(0, 4) + '••••' + val.slice(-4)` (or `••••••••` if short).
  - Unmasked secrets are returned **only once** upon creation or explicit regeneration (e.g., `regenerate_newsletter_secret: true`).
  - Secret updates must be write-only: if the payload contains `••••`, the existing secret must be preserved rather than overwritten with bullets.

### 2.5 Security Headers & Content Security Policy (CSP)
* **Global Middleware (`apps/api/src/index.ts`)**:
  - Injected inside a `try ... finally` block so headers are guaranteed even on 500 unhandled errors.
  - Headers set:
    - `X-Content-Type-Options: nosniff`
    - `X-Frame-Options: DENY`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - **Dynamic Host-Aware CSP**:
    - Host regex `/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)` strictly isolates local dev from production. Subdomains like `localhost.attacker.com` are treated as external.
    - Local dev allows `connect-src 'self' http://localhost:* http://127.0.0.1:* ws: wss: https:`.
    - Production enforces strict `connect-src 'self' https: wss:`.
    - Frame ancestors are denied (`frame-ancestors 'none'`).

### 2.6 Mandatory Security Audit Verification
Whenever an API endpoint is added or modified, the developer or AI agent **must run and pass** the dedicated security audit test:
```bash
npm --workspace=apps/api test
# or: node apps/api/tests/test_security_audit.mjs
```
The test suite validates:
1. MCP Auth enforcement & WWW-Authenticate headers.
2. OAuth fail-closed PIN, client registration, and strict `redirect_uri` validation.
3. SSRF IPv4/IPv6 blocking and redirect hop protection.
4. Telegram `setWebhook` origin verification (disallowing arbitrary attacker origin injection).
5. Fail-closed API authentication under `REQUIRE_API_KEY=true`.
6. Secret masking on user settings (read vs regenerate).
7. Stored XSS sanitization on source creation.
8. OAuth CSRF cookies, confidential client secret validation, rate limits, and MCP read/write scopes.
9. CORS restrictions for unauthorized external origins.
10. Security headers, host-aware CSP, and URL scheme validation on sources.

---

## 3. Cloudflare Workers Runtime & Resource Limits Policy

Mnema is engineered to run seamlessly on the **Cloudflare Workers Free Tier**. Violating these limits causes worker termination, HTTP 503/1101 errors, or daily quota lockouts.

### 3.1 10ms CPU Execution Limit Guardrails
On the Free Tier, Cloudflare Workers have a maximum of **10 milliseconds of active CPU execution time** per incoming HTTP request (I/O wait time does not count toward CPU limit).

* **Feed Parsing Optimization (`apps/api/src/features/capture/rss.ts`)**:
  - **Forbidden**: Loading heavyweight DOM/XML parsers (like `@xmldom/xmldom` or huge Linkedom trees) over entire 500-item RSS XML payloads.
  - **Mandatory Pattern**: Lightweight regex-based block slicing using `extractBlocks(trimmed, 'entry', maxItems)` with `maxItems = 30`.
  - Item synchronization limits:
    - Scheduled RSS sync is capped at `maxFeedsPerRun = 4` feeds per cron trigger.
    - Global fetch budget across feeds is capped at `budget.remainingFetches = 15`.
* **Async Deferral via `ctx.waitUntil`**:
  - Non-critical side-effects (updating `last_used_at` on API keys, logging review streaks, firing webhooks, writing daily R2 backups) must be scheduled via `ctx.waitUntil()`. Never block the HTTP response on background tasks.
* **Client-Side Offloading**:
  - When feasible, offload heavy CPU work to the client browser (e.g., PDF.js client-side stream extraction in `apps/web/src/services/pdfExtractor.ts`, readability fallback in web reader).

### 3.2 Workers AI Daily Neuron Budget & Fallback Mechanism
Cloudflare Workers AI Free Tier provides **10,000 Neurons per day**. Exceeding this quota results in HTTP 429 errors from Cloudflare.

* **Safe Quota Ceiling**:
  - Defined in `apps/api/src/core/helpers.ts` as `WORKERS_AI_DAILY_LIMIT = 8500`.
  - Usage is tracked atomically using KV (`OAUTH_KV`) with daily keys: `ai_neurons:YYYY-MM-DD` (TTL: 48h), falling back to an in-memory counter if KV is unavailable.
* **Mandatory Fallback Hierarchy**:
  1. **Primary Embedding**: Google Gemini (`gemini-embedding-001`, 1024-dim) if `GEMINI_API_KEY` is configured.
  2. **Secondary Embedding**: Cloudflare Workers AI (`@cf/baai/bge-m3`, 1024-dim) if `checkWorkersAiBudget(env).allowed` is true.
  3. **Guaranteed Local Fallback**: `local_trigram` (256-dim normalized vector using FNV-1a ASCII unigram, bigram, and trigram hashing from `apps/api/src/features/ai/embeddings.ts`).
* **Strict Rule**: Semantic search and similarity calculation **must never throw** because Workers AI is exhausted. If the budget is spent, gracefully fall back to `local_trigram` and log a diagnostic warning.

```typescript
// ✅ REQUIRED PATTERN for AI operations
const budget = await checkWorkersAiBudget(env);
if (!budget.allowed) {
  console.warn(`Workers AI budget reached (${budget.used}/${budget.limit}). Falling back to local trigram.`);
  return generateLocalFallback();
}
```

### 3.3 Gemini API Error Propagation & Model Fallback
* **Model Selection Strategy**:
  - `GEMINI_TEXT_MODELS` defined in `apps/api/src/core/helpers.ts`:
    1. `gemini-3.5-flash-lite`
    2. `gemini-2.5-flash`
    3. `gemini-2.5-flash-lite`
    4. `gemini-2.0-flash`
* **Error Propagation Guidelines**:
  - **404 Model Not Found**: If Google returns 404 for a model version (e.g., deprecated or region-locked), catch and automatically continue to the next model in `GEMINI_TEXT_MODELS`.
  - **400 / 403 / 429 Errors**: Non-404 status codes (invalid API key, quota exceeded, bad safety prompt) must **not** be swallowed silently into empty strings. Store the error message (`Gemini API error (403): ...`) and propagate it to the client with an actionable HTTP status so the user knows to update their key or prompt.

### 3.4 Non-Destructive Incremental D1 Migrations
Cloudflare D1 is an edge SQLite database. Production schema changes must never risk data loss or break existing installations.

* **Migration Sequence**:
  - Located in `apps/api/migrations/`.
  - Numbered sequentially with 4 digits and descriptive names:
    - `0001_initial.sql`: Base tables (`sources`, `highlights`, `tags`, etc.).
    - `0002_shelves_fts_notes.sql`: Shelves, collections, activity log.
    - `0003_screvi_full_features.sql`: Custom reviews, tools log.
    - `0004_fts_triggers.sql`: FTS triggers, review undo prev_state.
    - `0005_core_parity.sql`: User settings, RSS feeds, shares, embeddings.
    - `0006_ai_threads.sql`: Multi-turn Ask AI threads & messages.
    - `0007_api_keys.sql`: Public REST API keys table.
    - `0008_stabilization.sql`: Performance indexes, Telegram review tracking.
    - `0009_fsrs.sql`: Nullable FSRS scheduling columns.
    - `0010_fts_ascii.sql`: Accent-insensitive Vietnamese FTS5 tables.
    - `0011_timezone_offset.sql`: User timezone offset column.
    - Future migrations **must** be named `0012_<feature>.sql`, `0013_<feature>.sql`, etc.
* **Strict Migration Rules**:
  1. **Non-Destructive**: Never issue `DROP TABLE` on tables containing user data (`sources`, `highlights`, `tags`, `shelves`, `user_settings`, `api_keys`).
  2. **Additive Columns**: Use `ALTER TABLE <table> ADD COLUMN <col> <type> DEFAULT ...;`. Columns must be nullable or provide a safe default value.
  3. **Idempotence**: Always use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `DROP TRIGGER IF EXISTS` before recreating triggers.
  4. **Virtual Tables (FTS5)**: When modifying FTS5 virtual tables, recreate triggers and re-index existing records without dropping base content tables.

### 3.5 Cloudflare R2 Backup Lifecycle & Retention
* **Daily Automated Backup (`apps/api/src/index.ts`)**:
  - The scheduled cron trigger (`0 3 * * *` or during scheduled worker executions) invokes `runDailyR2Backup()`.
  - Backup target: `EPUB_BUCKET` R2 bucket under `backups/mnema-backup-YYYY-MM-DD.json`.
  - Snapshot contents: Complete JSON snapshot of `sources`, `highlights`, `tags`, `highlight_tags`, and `shelves`.
* **Idempotence**:
  - Uses `await env.EPUB_BUCKET.head(backupKey)` to ensure the backup is written at most once per calendar day.
* **Retention & Storage Limits**:
  - Cloudflare R2 Free Tier allows **10 GB/month** storage and **1,000,000 Class A operations/month**.
  - A Mnema snapshot is typically 500 KB to 5 MB. Retaining 30 daily snapshots consumes < 150 MB (< 2% of Free Tier quota).
  - Users can configure R2 Bucket Lifecycle Rules in the Cloudflare Dashboard to auto-delete objects under `backups/` older than 90 days.

---

## 4. Maintenance Guidelines & Development Workflow

### 4.1 Adding a New Feature Endpoint (Checklist)
When introducing a new domain capability (e.g., adding a new integration or library feature):

1. **Shared Types**: Add required DTO interfaces and types to `packages/shared/src/types.ts`.
2. **Database Migration** (if schema changed):
   - Create `apps/api/migrations/00XX_<descriptive_name>.sql`.
   - Ensure the SQL is additive, idempotent, and non-destructive.
3. **Backend Route**:
   - Create or update the route file inside the appropriate feature directory (`apps/api/src/features/<feature>/`).
   - If external network calls are performed, use `safeFetch`.
   - If user HTML is saved, use `sanitizeHtml`.
   - If secrets are queried, ensure `toPublicSettings` masks them.
   - Mount the router in `apps/api/src/index.ts`.
4. **Frontend Service**:
   - Add the corresponding API method in `apps/web/src/services/api/<domain>.ts`.
   - Export through `apps/web/src/services/api/index.ts`.
5. **Security & Parity Tests**:
   - If the endpoint touches authentication, SSRF, settings, or external URLs, add test assertions to `apps/api/tests/test_security_audit.mjs`.

### 4.2 Mandatory Verification Command Matrix
Before committing any changes, run the full verification matrix in this exact order:

| Step | Command | Expected Outcome |
| :--- | :--- | :--- |
| **1. Monorepo Build & Typecheck** | `npm run build` | All packages compile with 0 TypeScript errors. Web bundle builds without bloat warnings. |
| **2. Security Audit Suite** | `npm --workspace=apps/api test` | All 10 security test suites pass (MCP, OAuth, SSRF, Fail-closed Auth, XSS, CSP, etc.). |
| **3. Full Feature & Parity Tests** | `node apps/api/tests/run_inprocess_tests.mjs` | All 9 comparison modules, 18 core parity tests, and scheduled cron simulations pass 100%. |

### 4.3 Policy Violation Escalation
Any PR or commit that:
- Bypasses `safeFetch` for raw `fetch` to external URLs,
- Exposes unmasked secrets in settings endpoints,
- Introduces destructive SQL migrations (`DROP TABLE sources`), or
- Weakens test assertions in `test_security_audit.mjs` to make a failing build pass,
**must be rejected immediately** during code review.
