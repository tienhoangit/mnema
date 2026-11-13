# Security, Performance, and Maintainability Hardening Walkthrough

This document summarizes the comprehensive security hardening, bundle optimization, data integrity fixes, code health refactoring, and type safety improvements implemented across Mnema (`mnema-api`, `mnema-web`, `mnema-extension`).

---

## 1. Security Hardening (Phase 1)

### 1.1 Safe URL Sanitization Helper & Open Redirect Prevention
- **File**: `apps/web/src/utils/url.ts`
- **Implementation**: Created `getSafeHttpUrl`, `safeUrl`, and `isSafeUrl` helpers that strictly allow `http:` and `https:` schemes, safe relative paths (`/path`), rejecting:
  - `javascript:`, `data:`, `vbscript:` schemes
  - Control characters `[\x00-\x1F\x7F]`
  - Protocol-relative URLs (`//evil.com`)
  - Backslash evasions (`/\\evil.com`, `/\evil.com`) which browsers normalize to protocol-relative redirects.

### 1.2 Dynamic `<a href>` Hardening
- **Files**:
  - `apps/web/src/components/ReaderView.tsx`: Wrapped `source.url` external link with `getSafeHttpUrl(source.url)` and `rel="noopener noreferrer"`.
  - `apps/web/src/components/SourceView.tsx`: Wrapped `source.url` external link with `getSafeHttpUrl(source.url)` and `rel="noopener noreferrer"`.
  - `apps/web/src/components/ExploreView.tsx`: Conditionally rendered external link with `getSafeHttpUrl(item.url)` and `rel="noopener noreferrer"` (eliminating broken `#` links that opened blank tabs).
  - `apps/web/src/components/PublicShareView.tsx`: Replaced duplicated inline URL parser with the canonical `getSafeHttpUrl` import from `../utils/url` and added `rel="noopener noreferrer"`.

### 1.3 Backend URL Scheme Validation
- **File**: `apps/api/src/routes/sources.ts` (POST `/api/sources`)
- **Implementation**: Added strict URL scheme and format validation rejecting non-HTTP/HTTPS URLs (`javascript:`, `data:`, etc.) with HTTP 400.

### 1.4 Removed Insecure `localStorage` Gemini Key Storage
- **Files**:
  - `apps/web/src/components/SettingsView.tsx`: Removed `localStorage` key reading and writing; purges any legacy keys from storage; saves API keys exclusively to the server via `/api/settings`.
  - `apps/web/src/components/AiCopilotModal.tsx`: Removed `localStorage` key storage; cleans up legacy keys; uses `api.askArticleQuestion`.
  - `apps/web/src/components/AskAiHighlightModal.tsx`: Removed `localStorage` key reading; delegates to server settings.
  - `apps/web/src/components/CreateNewModal.tsx`: Removed `localStorage` key reading in tidy-up and OCR.
  - `apps/web/src/components/DailyReviewView.tsx`: Removed `localStorage` key reading in similar highlights.
  - `apps/web/src/components/ExploreView.tsx`: Removed `localStorage` key reading in topic discovery.
  - `apps/web/src/components/KindleImportModal.tsx`: Removed `localStorage` key reading in embedding sync.
  - `apps/web/src/components/SearchView.tsx`: Removed `localStorage` key reading in semantic search and AI Q&A.

### 1.5 Public Share Safe `apiFetch` & Global Session Expiry Handling
- **Files**:
  - `apps/web/src/services/api.ts`: Added `skipAuthIntercept?: boolean` option and automated public route detection (`/api/public/*`, `/public/share/*`). Prevents dispatching `mnema:session-expired` on 401/404, allowing `PublicShareView` to cleanly display its "Share link not found or has been revoked" state without triggering Cloudflare Access session expired banners.
  - Added `getActivityStats()` method on `api` to route activity fetching through `apiFetch`.
  - `apps/web/src/components/DailyReviewView.tsx`: Replaced raw `fetch('/api/stats/activity')` with `api.getActivityStats()`.
  - `apps/web/src/components/EpubReaderPane.tsx`: Replaced raw `fetch('/api/sources/:id/epub')` with `apiFetch`.

### 1.6 Host-Aware Security Headers & Content Security Policy (CSP)
- **File**: `apps/api/src/index.ts`
- **Implementation**: Added Hono middleware dynamically inspecting `host` using strict regex `/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)` to prevent subdomain spoofing bypasses (`localhost.attacker.com`).
  - On local/loopback: allows `connect-src 'self' http://localhost:* http://127.0.0.1:* ws: wss: https:;`.
  - On production: enforces strict `connect-src 'self' https: wss:;`.
  - Added `try ... finally` block so headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and CSP) are guaranteed even on 500 unhandled errors.

### 1.7 Fail-Closed API Key Auth Hardening
- **File**: `apps/api/src/middleware/apiKeyAuth.ts`
- **Implementation**: Fixed regression where `REQUIRE_API_KEY=true` was inadvertently bypassed by loopback hostnames, resolving test failures in `test_high_roi_features.mjs`.

---

## 2. Bundle & Performance Optimization (Phase 2)

### 2.1 View Code Splitting with `React.lazy()`
- **File**: `apps/web/src/App.tsx`
- **Implementation**: Converted all 15 views (`HomeFeedView`, `DailyReviewView`, `ArticlesView`, `SourcesView`, `SourceView`, `NotesView`, `SearchView`, `TrashView`, `StatsView`, `ExploreView`, `TagsView`, `SettingsView`, `IntegrationsView`, `PublicShareView`, `ReaderView`) to `React.lazy()` with `<React.Suspense>` fallback.

### 2.2 Modal Code Splitting
- **File**: `apps/web/src/components/AppModals.tsx`
- **Implementation**: Converted all 8 modals (`CreateNewModal`, `KindleImportModal`, `ExportModal`, `CommandPalette`, `ShareQuoteModal`, `AskAiHighlightModal`, `LibraryToolsModal`, `SendEmailModal`) to `React.lazy()` and conditionally rendered inside `<Suspense fallback={null}>` only when active.

### 2.3 On-Demand PDF Extractor Loading
- **File**: `apps/web/src/components/KindleImportModal.tsx`
- **Implementation**: Switched `extractPdfInBrowser` to dynamic `await import('../services/pdfExtractor')` so heavy PDF.js parser libraries are loaded only when a user selects a PDF file.

### 2.4 Service Worker Workbox Precache Optimization
- **File**: `apps/web/vite.config.ts`
- **Implementation**: Excluded `pdf.worker` chunk (1.27 MB) from Workbox precache using `globIgnores: ['**/pdf.worker*']`, reducing precache footprint from 3.22 MB to 2.53 MB.

### 2.5 Font Import Pruning
- **File**: `apps/web/src/main.tsx`
- **Implementation**: Pruned unused font weights and styles (`figtree/800`, `figtree/400-italic`, `lora/500`, `lora/600`, `lora/700-italic`), retaining core UI weights (`figtree 400, 500, 600, 700`) and reading serif weights (`lora 400, 700, 400-italic`).

### 2.6 Bundle Size Impact
- **Main JS Bundle**: Reduced from **685 kB** to **330 kB** (**>50% size reduction**, 98 kB gzipped).
- **Initial Precache**: Dropped from **3,224 KiB** to **2,537 KiB**.

---

## 3. Data Integrity & Render Janks (Phase 3)

### 3.1 API Pagination & Complete Export Helper
- **File**: `apps/web/src/services/api.ts`
- **Implementation**: Added `limit` and `offset` support to `getSources` and `getHighlights`; implemented `getAllHighlights()` pagination loop.

### 3.2 Full Export & Re-render Prevention in `ExportModal.tsx`
- **File**: `apps/web/src/components/ExportModal.tsx`
- **Implementation**:
  - Automatically fetches all highlights in the library via `api.getAllHighlights()` when the modal is opened, guaranteeing full export rather than being capped at the default 50 highlights.
  - Fixed zero-highlight state handling (`Array.isArray(data)`) so empty libraries don't fall back to stale previous data.
  - Added unmount cancellation flag (`let active = true; return () => { active = false; };`) and removed unstable array dependency from `useEffect`.

### 3.3 Accurate Tag Counts in `TagsView.tsx`
- **File**: `apps/web/src/components/TagsView.tsx`
- **Implementation**: Uses `dbTags.count` calculated from D1 database across all non-deleted highlights, preventing client-side overwrite with `1`. Wrapped tag aggregation and sorting in `useMemo`.

### 3.4 Memoized Reader HTML Sanitization
- **File**: `apps/web/src/components/ReaderView.tsx`
- **Implementation**:
  - Memoized `DOMPurify.sanitize` output using `useMemo([source.content_html, offlineFallbackHtml])`, preventing synchronous DOMPurify overhead during reader scrolling, selection, text-to-speech, and font updates.
  - Added `ADD_ATTR: ['target']` so external links retain `target="_blank"` attributes.

### 3.5 O(1) Sources Map & Stable Sort in `HomeFeedView.tsx`
- **File**: `apps/web/src/components/HomeFeedView.tsx`
- **Implementation**: Memoized `sourcesMap` using `useMemo` for O(1) source lookups during filtering. Replaced non-transitive `0.5 - Math.random()` with proper Fisher-Yates shuffle algorithm and memoized `filteredHighlights` and `allTags`.

### 3.6 Memoized Modal State Handlers
- **File**: `apps/web/src/hooks/useModalState.ts`
- **Implementation**: Wrapped all 17 modal open/close/toggle handlers in `useCallback(..., [])` to preserve referential stability and eliminate unnecessary re-renders.

### 3.7 Wired Dead Props in `SearchView.tsx`
- **File**: `apps/web/src/components/SearchView.tsx`
- **Implementation**: Destructured and wired `onSelectHighlight`, `onAskAiHighlight`, and `onShareHighlight` props across keyword search results, semantic similarity matches, and AI citations.

### 3.8 Helper Standardization in `highlights.ts`
- **File**: `apps/api/src/routes/highlights.ts`
- **Implementation**: Standardized tag JSON deserialization to use `parseTagsJson` helper across highlight endpoints.

---

## 4. Type Safety & Tests (Phase 4)

### 4.1 Type Definitions
- **File**: `apps/web/src/types/index.ts`
- **Implementation**: Added `favorite?: boolean` to interface `Source`.

### 4.2 Dead Code Removal
- **File**: `apps/web/src/components/HighlightCard.tsx` (Deleted unused proxy file).

### 4.3 Automated Test Suites
- **File**: `apps/api/package.json` & `apps/api/test_security_audit.mjs`
- **Implementation**:
  - Added `"test": "node test_security_audit.mjs"` to `apps/api/package.json`.
  - Added Test Suite 10 to `test_security_audit.mjs` verifying:
    1. `X-Content-Type-Options: nosniff`
    2. `X-Frame-Options: DENY`
    3. Dynamic Host-Aware CSP (`localhost:8787` vs `localhost.attacker.com` vs production `api.mnema.app`)
    4. `POST /api/sources` URL scheme validation rejecting `javascript:` with HTTP 400.
  - Verified `test_high_roi_features.mjs` passes 100% (fixed `REQUIRE_API_KEY` regression).

---

## 5. Verification Results

1. **Security Audit Test Suite**:
   ```bash
   npm --prefix apps/api run test
   ```
   **Output**:
   ```
   > mnema-api@1.0.0 test
   > node test_security_audit.mjs

   1. Testing MCP Auth enforcement...
   2. Testing OAuth fail-closed PIN & strict redirect_uri...
   3. Testing SSRF protection...
   4. Testing Telegram setWebhook origin hardening...
   5. Testing fail-closed API auth...
   6. Testing secret masking on settings...
   7. Testing stored XSS sanitization...
   8. Testing OAuth CSRF, confidential client, rate limit, and MCP scopes...
   9. Testing CORS restriction and Telegram 403...
   10. Testing Security Headers, CSP & Source URL Scheme Validation...
   ✅ ALL SECURITY AUDIT TESTS PASSED!
   ```

2. **High-ROI Features Test Suite**:
   ```bash
   node apps/api/test_high_roi_features.mjs
   ```
   **Output**:
   ```
   1. Testing Public REST API Keys & X-Api-Key middleware...
   2. Testing Client-Side Readability Offload in POST /api/sources...
   3. Testing AI Topic Discovery (/api/ai/discover-topics)...
   ✅ ALL HIGH-ROI FEATURE TESTS PASSED!
   ```

3. **Clean Monorepo Build**:
   ```bash
   npm run build
   ```
   **Output**:
   - `mnema-api`: `tsc --noEmit` passed cleanly (0 errors).
   - `mnema-extension`: `node build.mjs && tsc --noEmit` passed cleanly (0 errors).
   - `mnema-web`: `tsc -b && vite build` passed cleanly with code 0. Main chunk 330 kB, SW precache 2,537 KiB.
