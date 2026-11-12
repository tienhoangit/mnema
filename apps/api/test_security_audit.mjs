import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import esbuild from 'esbuild';

const API_DIR = path.resolve(import.meta.dirname);
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
    const defaultPinRejected = await callWorker(
      '/authorize',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: 'mnema123',
          client_id: client.client_id,
          redirect_uri: 'https://client.example.com/cb',
        }),
      },
      { MCP_PIN: 'super-secret-999' }
    );
    assert(defaultPinRejected.status === 401, `Default mnema123 should be rejected when MCP_PIN is set, got ${defaultPinRejected.status}`);

    // Configured AUTH_PIN_HASH -> works with matching PIN
    const pinHash = crypto.createHash('sha256').update('hashed-pin-42').digest('hex');
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

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
