import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import esbuild from 'esbuild';

const API_DIR = path.resolve(import.meta.dirname);
const MIGRATIONS_DIR = path.join(API_DIR, 'migrations');
const BUNDLE_OUT = path.join(API_DIR, '.tmp-high-roi-test.mjs');

class D1Statement {
  constructor(sqlite, sql, params = []) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.params = params;
  }
  bind(...args) {
    const normalized = args.map((v) =>
      v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v
    );
    return new D1Statement(this.sqlite, this.sql, normalized);
  }
  async first(colName) {
    const row = this.sqlite.prepare(this.sql).get(...this.params);
    if (!row) return null;
    if (colName !== undefined) return row[colName] ?? null;
    return { ...row };
  }
  async all() {
    const rows = this.sqlite
      .prepare(this.sql)
      .all(...this.params)
      .map((r) => ({ ...r }));
    return { results: rows, success: true, meta: {} };
  }
  async run() {
    const info = this.sqlite.prepare(this.sql).run(...this.params);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(info.changes ?? 0),
        last_row_id: Number(info.lastInsertRowid ?? 0),
      },
    };
  }
}

function createD1Database() {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
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

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
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

  try {
    const mod = await import(pathToFileURL(BUNDLE_OUT).href + `?t=${Date.now()}`);
    const worker = mod.default;
    const db = createD1Database();
    const baseEnv = { DB: db };

    // 1. Public REST API Keys & X-Api-Key Middleware
    console.log('1. Testing Public REST API Keys & X-Api-Key middleware...');
    {
      const badCreate = await worker.fetch(
        new Request('http://127.0.0.1/api/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: '   ' }),
        }),
        baseEnv
      );
      assert(badCreate.status === 400, `Empty key name should return 400, got ${badCreate.status}`);

      const createRes = await worker.fetch(
        new Request('http://127.0.0.1/api/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'iOS Shortcut', scopes: 'read,write' }),
        }),
        baseEnv
      );
      assert(createRes.status === 201, `Create key should return 201, got ${createRes.status}`);
      const createdJson = await createRes.json();
      const rawKey = createdJson.data.key;
      const keyId = createdJson.data.id;
      assert(rawKey.startsWith('mnema_live_'), 'Generated key should start with mnema_live_');

      // List keys should not expose key_hash or raw key
      const listRes = await worker.fetch(new Request('http://127.0.0.1/api/keys'), baseEnv);
      const listJson = await listRes.json();
      assert(listJson.data.length === 1, 'Should list 1 key');
      assert(!('key_hash' in listJson.data[0]), 'List must not expose key_hash');
      assert(!('key' in listJson.data[0]), 'List must not expose raw key');

      // Valid X-Api-Key succeeds and updates last_used_at
      const validReq = await worker.fetch(
        new Request('http://127.0.0.1/api/sources', {
          headers: { 'X-Api-Key': rawKey },
        }),
        baseEnv
      );
      assert(validReq.status === 200, `Valid X-Api-Key should return 200, got ${validReq.status}`);

      const listAfterUse = await (
        await worker.fetch(new Request('http://127.0.0.1/api/keys'), baseEnv)
      ).json();
      assert(Boolean(listAfterUse.data[0].last_used_at), 'last_used_at should be updated');

      // Invalid X-Api-Key is rejected with 401
      const invalidReq = await worker.fetch(
        new Request('http://127.0.0.1/api/sources', {
          headers: { 'X-Api-Key': 'mnema_live_invalid_000' },
        }),
        baseEnv
      );
      assert(invalidReq.status === 401, `Invalid X-Api-Key should return 401, got ${invalidReq.status}`);

      // REQUIRE_API_KEY=true enforces key on /api/sources, allows /api/health
      const strictEnv = { ...baseEnv, REQUIRE_API_KEY: 'true' };
      const unauthStrict = await worker.fetch(
        new Request('http://127.0.0.1/api/sources'),
        strictEnv
      );
      assert(unauthStrict.status === 401, `REQUIRE_API_KEY=true without key should return 401`);
      const healthStrict = await worker.fetch(
        new Request('http://127.0.0.1/api/health'),
        strictEnv
      );
      assert(healthStrict.status === 200, `Health check should stay 200 under REQUIRE_API_KEY=true`);

      // Read-only key blocks POST
      const roCreate = await (
        await worker.fetch(
          new Request('http://127.0.0.1/api/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'ReadOnly CLI', scopes: 'read' }),
          }),
          baseEnv
        )
      ).json();
      const roGet = await worker.fetch(
        new Request('http://127.0.0.1/api/sources', {
          headers: { 'X-Api-Key': roCreate.data.key },
        }),
        baseEnv
      );
      assert(roGet.status === 200, 'Read-only key should allow GET');
      const roPost = await worker.fetch(
        new Request('http://127.0.0.1/api/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': roCreate.data.key },
          body: JSON.stringify({ name: 'Blocked' }),
        }),
        baseEnv
      );
      assert(roPost.status === 403, `Read-only key should return 403 on POST, got ${roPost.status}`);

      // Read-only key should allow read-only MCP tools/list, but block mutating MCP tools/call
      const roMcpList = await worker.fetch(
        new Request('http://127.0.0.1/api/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': roCreate.data.key },
          body: JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'tools/list' }),
        }),
        baseEnv
      );
      assert(roMcpList.status === 200, `Read-only key should allow MCP tools/list, got ${roMcpList.status}`);

      const roMcpMutate = await worker.fetch(
        new Request('http://127.0.0.1/api/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': roCreate.data.key },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 11,
            method: 'tools/call',
            params: { name: 'add_highlight', arguments: { source_id: 'fake', content: 'Blocked' } },
          }),
        }),
        baseEnv
      );
      assert(
        roMcpMutate.status === 403,
        `Read-only key should return 403 on mutating MCP tool, got ${roMcpMutate.status}`
      );

      // MCP accepts X-Api-Key without OAuth 2.1 DCR
      const mcpRes = await worker.fetch(
        new Request('http://127.0.0.1/api/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': rawKey },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        }),
        baseEnv
      );
      assert(mcpRes.status === 200, `MCP with X-Api-Key should return 200, got ${mcpRes.status}`);

      // Revoke key -> subsequent request returns 401
      const revokeRes = await worker.fetch(
        new Request(`http://127.0.0.1/api/keys/${keyId}`, { method: 'DELETE' }),
        baseEnv
      );
      assert(revokeRes.status === 200, 'Revoke key should return 200');
      const afterRevoke = await worker.fetch(
        new Request('http://127.0.0.1/api/sources', {
          headers: { 'X-Api-Key': rawKey },
        }),
        baseEnv
      );
      assert(afterRevoke.status === 401, `Revoked key should return 401, got ${afterRevoke.status}`);
    }

    // 2. Client-Side Readability Offload (POST /api/sources)
    console.log('2. Testing Client-Side Readability Offload in POST /api/sources...');
    {
      const srcRes = await worker.fetch(
        new Request('http://127.0.0.1/api/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Pre-parsed Extension Article',
            author: 'Ada Lovelace',
            type: 'article',
            url: 'https://nonexistent.invalid/big-page',
            content_html: '<article><p>Analytical engine notes and ideas.</p></article>',
            word_count: 420,
            reading_time: 2,
            metadata: { site_name: 'Lovelace Notes', clipped_by: 'extension-readability' },
          }),
        }),
        baseEnv
      );
      assert(srcRes.status === 201, `Pre-parsed POST /api/sources should return 201, got ${srcRes.status}`);
      const srcJson = await srcRes.json();
      assert(srcJson.data.word_count === 420, 'Should preserve client word_count');
      assert(srcJson.data.reading_time === 2, 'Should preserve client reading_time');
      assert(
        JSON.parse(srcJson.data.metadata).clipped_by === 'extension-readability',
        'Should preserve client metadata'
      );

      // Also without url
      const noUrlRes = await worker.fetch(
        new Request('http://127.0.0.1/api/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Offline Clipped Note',
            content_html: '<p>One two three four five six</p>',
          }),
        }),
        baseEnv
      );
      assert(noUrlRes.status === 201, 'content_html without url should return 201');
      const noUrlJson = await noUrlRes.json();
      assert(noUrlJson.data.word_count === 6, `Expected word_count 6, got ${noUrlJson.data.word_count}`);
    }

    // 3. AI Topic Discovery (POST /api/ai/discover-topics)
    console.log('3. Testing AI Topic Discovery (/api/ai/discover-topics)...');
    {
      // Empty library returns empty clusters without calling AI
      const emptyRes = await worker.fetch(
        new Request('http://127.0.0.1/api/ai/discover-topics', { method: 'POST' }),
        baseEnv
      );
      assert(emptyRes.status === 200, 'Empty library discover-topics should return 200');
      const emptyJson = await emptyRes.json();
      assert(emptyJson.data.clusters.length === 0, 'Empty library should have 0 clusters');

      // Seed a source, tag, and 2 highlights
      const srcRes = await (
        await worker.fetch(
          new Request('http://127.0.0.1/api/sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Thinking in Systems', author: 'Donella Meadows', type: 'book' }),
          }),
          baseEnv
        )
      ).json();
      const hl1 = await (
        await worker.fetch(
          new Request('http://127.0.0.1/api/highlights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source_id: srcRes.data.id,
              content: 'A system is an interconnected set of elements coherently organized.',
            }),
          }),
          baseEnv
        )
      ).json();
      const hl2 = await (
        await worker.fetch(
          new Request('http://127.0.0.1/api/highlights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source_id: srcRes.data.id,
              content: 'Feedback loops govern how stocks change over time.',
            }),
          }),
          baseEnv
        )
      ).json();

      // Mock Workers AI returning markdown-fenced JSON + a hallucinated ID
      const aiEnv = {
        ...baseEnv,
        AI: {
          async run() {
            return {
              response: `\`\`\`json
[
  {
    "title": "Feedback & Emergence",
    "summary": "Your highlights connect system structure with feedback dynamics.",
    "tags": ["systems", "complexity"],
    "highlightIds": ["${hl1.data.id}", "${hl2.data.id}", "non-existent-id"],
    "reflectionPrompt": "Where do hidden feedback loops shape your daily work?"
  }
]
\`\`\``,
            };
          },
        },
      };

      const discoverRes = await worker.fetch(
        new Request('http://127.0.0.1/api/ai/discover-topics', { method: 'POST' }),
        aiEnv
      );
      assert(discoverRes.status === 200, `discover-topics should return 200, got ${discoverRes.status}`);
      const discoverJson = await discoverRes.json();
      assert(discoverJson.data.clusters.length === 1, 'Should return 1 cluster');
      assert(
        discoverJson.data.clusters[0].highlights.length === 2,
        'Should hydrate 2 real highlights and filter out hallucinated ID'
      );
      assert(
        discoverJson.data.clusters[0].highlights[0].source_name === 'Thinking in Systems',
        'Should include source_name on hydrated highlights'
      );

      // Malformed JSON from LLM should gracefully fall back to empty clusters (200), not 500
      const malformedAiEnv = {
        ...baseEnv,
        AI: {
          async run() {
            return {
              response: `[Note: here are your clusters] [{"title": "Broken", "summary": "Oops",}]`,
            };
          },
        },
      };
      const malformedRes = await worker.fetch(
        new Request('http://127.0.0.1/api/ai/discover-topics', { method: 'POST' }),
        malformedAiEnv
      );
      assert(
        malformedRes.status === 200,
        `Malformed AI JSON should gracefully return 200, got ${malformedRes.status}`
      );
      const malformedJson = await malformedRes.json();
      assert(
        Array.isArray(malformedJson.data.clusters) && malformedJson.data.clusters.length === 0,
        'Malformed AI JSON should fall back to empty clusters array'
      );

      // Duplicate highlightIds and tags in LLM output should be deduplicated
      const dupAiEnv = {
        ...baseEnv,
        AI: {
          async run() {
            return {
              response: JSON.stringify([
                {
                  title: 'Systems Thinking',
                  summary: 'Connected ideas.',
                  tags: ['systems', 'systems', 'feedback'],
                  highlightIds: [hl1.data.id, hl1.data.id, hl2.data.id],
                  reflectionPrompt: 'Why?',
                },
              ]),
            };
          },
        },
      };
      const dupRes = await worker.fetch(
        new Request('http://127.0.0.1/api/ai/discover-topics', { method: 'POST' }),
        dupAiEnv
      );
      const dupJson = await dupRes.json();
      assert(
        dupJson.data.clusters[0].highlights.length === 2,
        `Duplicate highlightIds should be deduplicated, got ${dupJson.data.clusters[0].highlights.length}`
      );
      assert(
        dupJson.data.clusters[0].tags.length === 2,
        `Duplicate tags should be deduplicated, got ${dupJson.data.clusters[0].tags.length}`
      );
    }

    console.log('✅ ALL HIGH-ROI FEATURE TESTS PASSED!');
  } finally {
    if (fs.existsSync(BUNDLE_OUT)) fs.unlinkSync(BUNDLE_OUT);
  }
}

run().catch((err) => {
  console.error('❌ HIGH-ROI TEST FAILED:', err);
  process.exit(1);
});

