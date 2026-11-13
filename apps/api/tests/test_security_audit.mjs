import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import esbuild from 'esbuild';

const TESTS_DIR = path.resolve(import.meta.dirname);
const API_DIR = path.resolve(TESTS_DIR, '..');
const MIGRATIONS_DIR = path.join(API_DIR, 'migrations');
const BUNDLE_OUT = path.join(API_DIR, '.tmp-security-test.mjs');

class D1Statement {
  constructor(sqlite, sql, params = []) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.params = params;
  }
  bind(...args) {
    const normalized = args.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
    return new D1Statement(this.sqlite, this.sql, normalized);
  }
  async first(colName) {
    const row = this.sqlite.prepare(this.sql).get(...this.params);
    if (!row) return null;
    if (colName !== undefined) return row[colName] ?? null;
    return { ...row };
  }
  async all() {
    const rows = this.sqlite.prepare(this.sql).all(...this.params).map((r) => ({ ...r }));
    return { results: rows, success: true, meta: {} };
  }
  async run() {
    const info = this.sqlite.prepare(this.sql).run(...this.params);
    return {
      success: true,
      results: [],
      meta: { changes: Number(info.changes ?? 0), last_row_id: Number(info.lastInsertRowid ?? 0) },
    };
  }
}

function createD1Database() {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of migrations) {
    sqlite.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }
  return {
    prepare: (sql) => new D1Statement(sqlite, sql),
    exec: (sql) => {
      sqlite.exec(sql);
      return Promise.resolve({ count: 1, duration: 0 });
    },
  };
}

function createMemoryKv() {
  const map = new Map();
  return {
    get: async (k) => map.get(k) ?? null,
    put: async (k, v) => {
      map.set(k, v);
    },
    delete: async (k) => {
      map.delete(k);
    },
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function assertThrows(fn, msg) {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(`Expected to throw: ${msg}`);
}

async function run() {
  await esbuild.build({
    entryPoints: [path.join(API_DIR, 'src', 'index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: BUNDLE_OUT,
    logLevel: 'silent',
  });

  // Also bundle urlSafety, readability, rss for direct unit testing
  const SAFETY_OUT = path.join(API_DIR, '.tmp-safety-test.mjs');
  await esbuild.build({
    entryPoints: [path.join(API_DIR, 'src', 'services', 'urlSafety.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: SAFETY_OUT,
    logLevel: 'silent',
  });

  const READABILITY_OUT = path.join(API_DIR, '.tmp-readability-test.mjs');
  await esbuild.build({
    entryPoints: [path.join(API_DIR, 'src', 'services', 'readability.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: READABILITY_OUT,
    logLevel: 'silent',
  });

  const RSS_OUT = path.join(API_DIR, '.tmp-rss-test.mjs');
  await esbuild.build({
    entryPoints: [path.join(API_DIR, 'src', 'services', 'rss.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: RSS_OUT,
    logLevel: 'silent',
  });

  const originalFetch = globalThis.fetch;
  try {
    const worker = (await import(`${pathToFileURL(BUNDLE_OUT).href}?t=${Date.now()}`)).default;
    const { assertSafeExternalUrl } = await import(`${pathToFileURL(SAFETY_OUT).href}?t=${Date.now()}`);
    const { parseArticleFromUrl } = await import(`${pathToFileURL(READABILITY_OUT).href}?t=${Date.now()}`);
    const { fetchAndParseFeed } = await import(`${pathToFileURL(RSS_OUT).href}?t=${Date.now()}`);

    const db = createD1Database();
    const kv = createMemoryKv();
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

    const callWorker = (pathAndQuery, init = {}, envOverrides = {}) => {
      const env = { DB: db, OAUTH_KV: kv, ...envOverrides };
      const req = new Request(`https://mnema.example.com${pathAndQuery}`, init);
      return worker.fetch(req, env, ctx);
    };

    // --- 1. MCP Auth Mandatory by Default ---
    console.log('1. Testing MCP Auth enforcement...');
    const mcpGetNoAuth = await callWorker('/api/mcp', { method: 'GET' });
    assert(mcpGetNoAuth.status === 401, `GET /api/mcp without auth should be 401, got ${mcpGetNoAuth.status}`);
    assert(Boolean(mcpGetNoAuth.headers.get('www-authenticate')), 'Missing WWW-Authenticate header');

    const mcpPostNoAuth = await callWorker('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert(mcpPostNoAuth.status === 401, `POST /api/mcp without auth should be 401, got ${mcpPostNoAuth.status}`);

    const mcpBadBearer = await callWorker('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer bad_token' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert(mcpBadBearer.status === 401, `POST /api/mcp with invalid bearer should be 401, got ${mcpBadBearer.status}`);

    const mcpLocalBypass = await callWorker(
      '/api/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      },
      { ALLOW_UNAUTH_MCP: 'true' }
    );
    assert(mcpLocalBypass.status === 200, `POST /api/mcp with ALLOW_UNAUTH_MCP=true should be 200, got ${mcpLocalBypass.status}`);

    const mcpOverrideBypass = await callWorker(
      '/api/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      },
      { ALLOW_UNAUTH_MCP: 'true', REQUIRE_MCP_AUTH: 'true' }
    );
    assert(mcpOverrideBypass.status === 401, `REQUIRE_MCP_AUTH=true must override ALLOW_UNAUTH_MCP, got ${mcpOverrideBypass.status}`);

    // --- 2. OAuth Fail-Closed PIN & Strict redirect_uri ---
    console.log('2. Testing OAuth fail-closed PIN & strict redirect_uri...');
    const regRes = await callWorker('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Test Client',
        redirect_uris: ['https://client.example.com/cb'],
      }),
    });
    assert(regRes.status === 201, 'Client registration failed');
    const client = await regRes.json();

    // Unconfigured PIN -> 500 even with 'mnema123'
    const noPinRes = await callWorker('/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pin: 'mnema123',
        client_id: client.client_id,
        redirect_uri: 'https://client.example.com/cb',
      }),
    });
    assert(noPinRes.status === 500, `Expected 500 when no PIN env vars set, got ${noPinRes.status}`);

    // Configured MCP_PIN -> 'mnema123' must fail with 401
    const pinHash = crypto.createHash('sha256').update('hashed-pin-42').digest('hex');
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

    const defaultPinRejected = await callWorker(
      '/authorize',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: 'mnema123',
          client_id: client.client_id,
          redirect_uri: 'https://client.example.com/cb',
          code_challenge: challenge,
          code_challenge_method: 'S256',
        }),
      },
      { MCP_PIN: 'super-secret-999' }
    );
    assert(defaultPinRejected.status === 401, `Default mnema123 should be rejected when MCP_PIN is set, got ${defaultPinRejected.status}`);

    // Configured AUTH_PIN_HASH -> works with matching PIN

    // GET /authorize with unregistered redirect_uri -> 400
    const badGetAuth = await callWorker(
      `/authorize?client_id=${client.client_id}&redirect_uri=${encodeURIComponent('https://evil.example.com/cb')}`
    );
    assert(badGetAuth.status === 400, `GET /authorize with unregistered redirect_uri should be 400, got ${badGetAuth.status}`);

    // GET /authorize with unknown client_id -> 400
    const unknownClientGet = await callWorker(
      `/authorize?client_id=mnema_client_nonexistent&redirect_uri=${encodeURIComponent('https://client.example.com/cb')}`
    );
    assert(unknownClientGet.status === 400, `GET /authorize with unknown client_id should be 400, got ${unknownClientGet.status}`);

    // POST /authorize with unregistered redirect_uri -> 400 (not 302)
    const badPostAuth = await callWorker(
      '/authorize',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: 'hashed-pin-42',
          client_id: client.client_id,
          redirect_uri: 'https://client.example.com/cb/extra',
          code_challenge: challenge,
          code_challenge_method: 'S256',
        }),
      },
      { AUTH_PIN_HASH: pinHash }
    );
    assert(badPostAuth.status === 400, `POST /authorize with unregistered redirect_uri should be 400, got ${badPostAuth.status}`);

    // Valid POST /authorize -> 302
    const goodAuth = await callWorker(
      '/authorize',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: 'hashed-pin-42',
          client_id: client.client_id,
          redirect_uri: 'https://client.example.com/cb',
          code_challenge: challenge,
          code_challenge_method: 'S256',
        }),
      },
      { AUTH_PIN_HASH: pinHash }
    );
    assert(goodAuth.status === 302, `Expected 302 on valid authorize, got ${goodAuth.status}`);
    const code = new URL(goodAuth.headers.get('location')).searchParams.get('code');

    // POST /token omitting redirect_uri -> 400
    const missingRedirToken = await callWorker('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: client.client_id,
        code_verifier: verifier,
      }),
    });
    assert(missingRedirToken.status === 400, `POST /token without redirect_uri should be 400, got ${missingRedirToken.status}`);

    // POST /token with wrong client_id -> 400
    const wrongClientToken = await callWorker('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: 'mnema_client_other',
        redirect_uri: 'https://client.example.com/cb',
        code_verifier: verifier,
      }),
    });
    assert(wrongClientToken.status === 400, `POST /token with wrong client_id should be 400, got ${wrongClientToken.status}`);

    // POST /token valid -> 200 & grants access to /api/mcp
    const goodTokenRes = await callWorker('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: client.client_id,
        redirect_uri: 'https://client.example.com/cb',
        code_verifier: verifier,
      }),
    });
    assert(goodTokenRes.status === 200, `Expected 200 on valid token exchange, got ${goodTokenRes.status}`);
    const tokenJson = await goodTokenRes.json();

    const mcpAuthed = await callWorker('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenJson.access_token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    assert(mcpAuthed.status === 200, `Valid Bearer token should access /api/mcp, got ${mcpAuthed.status}`);

    // --- 3. SSRF Protection ---
    console.log('3. Testing SSRF protection...');
    const blockedUrls = [
      'file:///etc/passwd',
      'ftp://example.com/file',
      'javascript:alert(1)',
      'http://localhost/admin',
      'http://sub.localhost./admin',
      'http://printer.local/status',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://127.0.0.1:8787/api',
      'http://127.10.20.30/',
      'http://10.0.0.1/',
      'http://172.16.0.1/',
      'http://172.31.255.254/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://0.0.0.0/',
      'http://0x7f000001/',
      'http://2130706433/',
      'http://[::1]/',
      'http://[0:0:0:0:0:0:0:1]/',
      'http://[fc00::1]/',
      'http://[fd12:3456:789a::1]/',
      'http://[fe80::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::ffff:169.254.169.254]/',
      'http://[::]/',
    ];
    for (const u of blockedUrls) {
      await assertThrows(() => assertSafeExternalUrl(u), `Should block ${u}`);
    }

    const allowedUrls = [
      'https://example.com/article',
      'http://172.15.0.1/feed.xml',
      'http://172.32.0.1/feed.xml',
      'https://8.8.8.8/',
    ];
    for (const u of allowedUrls) {
      assertSafeExternalUrl(u);
    }

    // Test redirect SSRF blocking in safeFetch (readability & rss)
    let fetchedTargets = [];
    globalThis.fetch = async (url) => {
      const u = typeof url === 'string' ? url : url.toString();
      fetchedTargets.push(u);
      if (u === 'https://redirector.example/start') {
        return new Response(null, {
          status: 302,
          headers: { Location: 'http://169.254.169.254/latest/meta-data/' },
        });
      }
      throw new Error(`Unexpected fetch to ${u}`);
    };

    await assertThrows(
      () => parseArticleFromUrl('https://redirector.example/start'),
      'parseArticleFromUrl must block redirect to 169.254.169.254'
    );
    await assertThrows(
      () => fetchAndParseFeed('https://redirector.example/start'),
      'fetchAndParseFeed must block redirect to 169.254.169.254'
    );
    assert(
      !fetchedTargets.some((t) => t.includes('169.254.169.254')),
      'Metadata IP must never be fetched after redirect'
    );

    // --- 4. Telegram setWebhook Origin Hardening ---
    console.log('4. Testing Telegram setWebhook origin hardening...');
    let telegramCalls = [];
    globalThis.fetch = async (url, init) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('api.telegram.org')) {
        telegramCalls.push({ url: u, body: JSON.parse(String(init?.body || '{}')) });
        return new Response(JSON.stringify({ ok: true, description: 'Webhook was set' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url, init);
    };

    const tgRes1 = await callWorker('/api/integrations/telegram/set-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bot_token: '123456:TESTTOKEN',
        origin: 'https://evil.attacker.com',
      }),
    });
    assert(tgRes1.status === 200, `Expected 200 from set-webhook, got ${tgRes1.status}`);
    assert(
      telegramCalls[0].body.url.startsWith('https://mnema.example.com/api/webhooks/telegram/'),
      `Expected derived request origin, got ${telegramCalls[0].body.url}`
    );

    const tgRes2 = await callWorker(
      '/api/integrations/telegram/set-webhook',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_token: '123456:TESTTOKEN',
          origin: 'https://evil.attacker.com',
        }),
      },
      { PUBLIC_ORIGIN: 'https://public.mnema.app/' }
    );
    assert(tgRes2.status === 200, `Expected 200 from set-webhook with PUBLIC_ORIGIN, got ${tgRes2.status}`);
    assert(
      telegramCalls[1].body.url.startsWith('https://public.mnema.app/api/webhooks/telegram/'),
      `Expected PUBLIC_ORIGIN, got ${telegramCalls[1].body.url}`
    );

    // --- 5. Fail-Closed API Auth & Local Loopback ---
    console.log('5. Testing fail-closed API auth...');
    const unauthRemote = await callWorker('/api/sources', { method: 'GET' }, { REQUIRE_API_KEY: 'true' });
    assert(unauthRemote.status === 401, `Expected 401 on remote /api/sources without auth, got ${unauthRemote.status}`);

    const cfAccessAuthed = await callWorker(
      '/api/sources',
      { method: 'GET', headers: { 'Cf-Access-Jwt-Assertion': 'dummy.jwt.token' } },
      { REQUIRE_API_KEY: 'true' }
    );
    assert(cfAccessAuthed.status === 200, `Expected 200 with Cf-Access-Jwt-Assertion, got ${cfAccessAuthed.status}`);

    const localReqDev = new Request('http://127.0.0.1:8787/api/sources', { method: 'GET' });
    const localResDev = await worker.fetch(localReqDev, { DB: db, OAUTH_KV: kv }, ctx);
    assert(localResDev.status === 200, `Expected 200 on local dev without REQUIRE_API_KEY, got ${localResDev.status}`);

    const localReqStrict = new Request('http://127.0.0.1:8787/api/sources', { method: 'GET' });
    const localResStrict = await worker.fetch(localReqStrict, { DB: db, OAUTH_KV: kv, REQUIRE_API_KEY: 'true' }, ctx);
    assert(localResStrict.status === 401, `Expected 401 on local request when REQUIRE_API_KEY=true, got ${localResStrict.status}`);

    // --- 6. Secret Masking on Settings ---
    console.log('6. Testing secret masking on settings...');
    const settingsGet = await callWorker('/api/email/settings');
    assert(settingsGet.status === 200, 'GET /api/email/settings should succeed');
    const settingsData = (await settingsGet.json()).data;
    assert(settingsData.has_newsletter_secret === true, 'has_newsletter_secret should be true');
    assert(settingsData.newsletter_secret.includes('••••'), `newsletter_secret should be masked, got ${settingsData.newsletter_secret}`);
    assert(settingsData.telegram_webhook_secret.includes('••••'), `telegram_webhook_secret should be masked, got ${settingsData.telegram_webhook_secret}`);

    const regenRes = await callWorker('/api/email/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regenerate_newsletter_secret: true }),
    });
    assert(regenRes.status === 200, 'PUT /api/email/settings regenerate should succeed');
    const regenData = (await regenRes.json()).data;
    assert(!regenData.newsletter_secret.includes('••••'), 'Regenerated newsletter_secret should be returned unmasked once');

    // --- 7. Stored XSS Sanitization on POST /api/sources ---
    console.log('7. Testing stored XSS sanitization...');
    const xssPayload = '<p>Hello</p><script>alert(1)</script><svg onload="alert(2)"><circle/></svg><img src="x" onerror="alert(3)"><a href="javascript:alert(4)">Click</a><scr<script>ipt>alert(5)</scr</script>ipt>';
    const xssRes = await callWorker('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'XSS Test', content_html: xssPayload }),
    });
    assert(xssRes.status === 201, `POST /api/sources XSS test failed: ${xssRes.status}`);
    const xssCreated = (await xssRes.json()).data;
    assert(!xssCreated.content_html.includes('<script'), 'Must strip <script>');
    assert(!xssCreated.content_html.includes('<svg'), 'Must strip <svg>');
    assert(!xssCreated.content_html.includes('onerror'), 'Must strip onerror');
    assert(!xssCreated.content_html.includes('javascript:'), 'Must strip javascript: URI');

    // --- 8. OAuth CSRF, Confidential Client & Rate Limiting + MCP Scope ---
    console.log('8. Testing OAuth CSRF, confidential client, rate limit, and MCP scopes...');
    const confReg = await callWorker('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Confidential Client',
        redirect_uris: ['https://conf.example.com/cb'],
        token_endpoint_auth_method: 'client_secret_post',
      }),
    });
    const confClient = await confReg.json();
    const getAuthRes = await callWorker(
      `/authorize?client_id=${confClient.client_id}&redirect_uri=${encodeURIComponent('https://conf.example.com/cb')}&code_challenge=${challenge}&code_challenge_method=S256&scope=read`
    );
    assert(getAuthRes.status === 200, `GET /authorize should return 200, got ${getAuthRes.status}`);
    const setCookie = getAuthRes.headers.get('set-cookie') || '';
    const csrfCookieMatch = setCookie.match(/mnema_oauth_csrf=([^;]+)/);
    assert(Boolean(csrfCookieMatch), 'GET /authorize must set CSRF cookie');
    const authHtml = await getAuthRes.text();
    const csrfInputMatch = authHtml.match(/name="csrf_token"\s+value="([^"]+)"/);
    assert(Boolean(csrfInputMatch), 'GET /authorize HTML must include hidden csrf_token');

    // Form POST without CSRF cookie -> 403
    const noCsrfForm = new URLSearchParams({
      pin: 'hashed-pin-42',
      client_id: confClient.client_id,
      redirect_uri: 'https://conf.example.com/cb',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      scope: 'read',
      csrf_token: csrfInputMatch[1],
    });
    const noCsrfRes = await callWorker(
      '/authorize',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: noCsrfForm.toString(),
      },
      { AUTH_PIN_HASH: pinHash }
    );
    assert(noCsrfRes.status === 403, `Form POST without CSRF cookie should return 403, got ${noCsrfRes.status}`);

    // Form POST with matching CSRF cookie + field -> 302
    const validCsrfRes = await callWorker(
      '/authorize',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `mnema_oauth_csrf=${csrfCookieMatch[1]}`,
        },
        body: noCsrfForm.toString(),
      },
      { AUTH_PIN_HASH: pinHash }
    );
    assert(validCsrfRes.status === 302, `Form POST with valid CSRF should return 302, got ${validCsrfRes.status}`);
    const confCode = new URL(validCsrfRes.headers.get('location')).searchParams.get('code');

    // Confidential client without client_secret -> 401
    const missingSecToken = await callWorker('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: confCode,
        client_id: confClient.client_id,
        redirect_uri: 'https://conf.example.com/cb',
        code_verifier: verifier,
      }),
    });
    assert(missingSecToken.status === 401, `Confidential client without secret should be 401, got ${missingSecToken.status}`);

    // Confidential client with valid client_secret -> 200 (read-only scope)
    const readOnlyTokenRes = await callWorker('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: confCode,
        client_id: confClient.client_id,
        client_secret: confClient.client_secret,
        redirect_uri: 'https://conf.example.com/cb',
        code_verifier: verifier,
      }),
    });
    assert(readOnlyTokenRes.status === 200, `Confidential client with valid secret should be 200, got ${readOnlyTokenRes.status}`);
    const readOnlyToken = await readOnlyTokenRes.json();

    // Read-only OAuth token calling mutating MCP tool 'add_tags' -> 403
    const mcpReadOnlyMutate = await callWorker('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${readOnlyToken.access_token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'add_tags', arguments: { tags: ['test'] } },
      }),
    });
    assert(mcpReadOnlyMutate.status === 403, `Read-only OAuth token calling add_tags should be 403, got ${mcpReadOnlyMutate.status}`);

    // --- 9. CORS Restriction & Telegram Webhook 403 ---
    console.log('9. Testing CORS restriction and Telegram 403...');
    const evilCors = await callWorker('/api/health', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.attacker.com', 'Access-Control-Request-Method': 'GET' },
    });
    assert(!evilCors.headers.get('access-control-allow-origin'), 'Evil origin must not receive ACAO header');

    const extCors = await callWorker('/api/health', {
      method: 'OPTIONS',
      headers: { Origin: 'chrome-extension://abcdef123456', 'Access-Control-Request-Method': 'GET' },
    });
    assert(extCors.headers.get('access-control-allow-origin') === 'chrome-extension://abcdef123456', 'Chrome extension origin should be allowed');

    // --- 10. Security Headers, CSP & Source URL Scheme Validation ---
    console.log('10. Testing Security Headers, CSP & Source URL Scheme Validation...');
    const localHostRes = await callWorker('/api/health', {
      headers: { Host: 'localhost:8787' },
    });
    assert(localHostRes.headers.get('x-content-type-options') === 'nosniff', 'Missing nosniff header');
    assert(localHostRes.headers.get('x-frame-options') === 'DENY', 'Missing X-Frame-Options DENY');
    const localCsp = localHostRes.headers.get('content-security-policy') || '';
    assert(localCsp.includes("connect-src 'self' http://localhost:*"), 'Localhost CSP missing localhost connect-src');

    const prodHostRes = await callWorker('/api/health', {
      headers: { Host: 'api.mnema.app' },
    });
    const prodCsp = prodHostRes.headers.get('content-security-policy') || '';
    assert(prodCsp.includes("connect-src 'self' https: wss:"), 'Prod CSP missing strict https connect-src');

    const attackerHostRes = await callWorker('/api/health', {
      headers: { Host: 'localhost.attacker.com' },
    });
    const attackerCsp = attackerHostRes.headers.get('content-security-policy') || '';
    assert(attackerCsp.includes("connect-src 'self' https: wss:"), 'localhost.attacker.com must NOT get dev connect-src');
    assert(!attackerCsp.includes("http://localhost:*"), 'localhost.attacker.com must NOT have localhost in connect-src');

    // Test POST /api/sources URL scheme validation
    const badSchemeRes = await callWorker('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'javascript:alert(1)', name: 'Evil Source' }),
    });
    assert(badSchemeRes.status === 400, `javascript: URL scheme should be rejected with 400, got ${badSchemeRes.status}`);

    console.log('✅ ALL SECURITY AUDIT TESTS PASSED!');
  } finally {
    globalThis.fetch = originalFetch;
    for (const f of [BUNDLE_OUT, SAFETY_OUT, READABILITY_OUT, RSS_OUT]) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  }
}

run().catch((err) => {
  console.error('❌ Security audit test failed:', err);
  process.exit(1);
});
