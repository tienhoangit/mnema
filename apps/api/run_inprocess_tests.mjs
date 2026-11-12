import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import zlib from 'node:zlib';
import esbuild from 'esbuild';

const API_DIR = path.resolve(import.meta.dirname);
const MIGRATIONS_DIR = path.join(API_DIR, 'migrations');
const BUNDLE_OUT = path.join(API_DIR, '.tmp-worker-test.mjs');

class D1Statement {
  constructor(sqlite, sql, params = []) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.params = params;
  }

  bind(...args) {
    const normalized = args.map((v) => {
      if (v === undefined) return null;
      if (typeof v === 'boolean') return v ? 1 : 0;
      return v;
    });
    return new D1Statement(this.sqlite, this.sql, normalized);
  }

  async first(colName) {
    const stmt = this.sqlite.prepare(this.sql);
    const row = stmt.get(...this.params);
    if (!row) return null;
    if (colName !== undefined) return row[colName] ?? null;
    return { ...row };
  }

  async all() {
    const stmt = this.sqlite.prepare(this.sql);
    const rows = stmt.all(...this.params).map((r) => ({ ...r }));
    return { results: rows, success: true, meta: {} };
  }

  async run() {
    const stmt = this.sqlite.prepare(this.sql);
    const info = stmt.run(...this.params);
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
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    sqlite.exec(sql);
  }

  return {
    _sqlite: sqlite,
    prepare(sql) {
      return new D1Statement(sqlite, sql);
    },
    exec(sql) {
      sqlite.exec(sql);
      return Promise.resolve({ count: 1, duration: 0 });
    },
    async batch(statements) {
      const results = [];
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        for (const st of statements) {
          const upper = st.sql.trim().toUpperCase();
          if (upper.startsWith('SELECT') || upper.startsWith('WITH') || upper.includes('RETURNING')) {
            results.push(await st.all());
          } else {
            results.push(await st.run());
          }
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function run() {
  // 1. Bundle apps/api/src/index.ts with esbuild
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
    const mod = await import(`${pathToFileURL(BUNDLE_OUT).href}?t=${Date.now()}`);
    const worker = mod.default;
    const db = createD1Database();

    // Track mocked external calls
    const sentEmails = [];
    const notionCreatedPages = [];
    let rssFetchCount = 0;
    let enableWorkersAiMock = false;

    const env = {
      DB: db,
      MCP_PIN: 'mnema123',
      ALLOW_UNAUTH_MCP: 'true',
      ASSETS: {
        fetch: async () => new Response('Not Found', { status: 404 }),
      },
      AI: {
        async run(_model, input) {
          if (_model === '@cf/meta/llama-3-8b-instruct') {
            return { response: 'AI Insight: Consistent micro-habits compound geometrically over time.' };
          }
          if (!enableWorkersAiMock) {
            throw new Error('Workers AI disabled in baseline test');
          }
          const texts = Array.isArray(input.text) ? input.text : [input.text];
          const data = texts.map((txt) => {
            const vec = new Array(32).fill(0);
            const lower = String(txt).toLowerCase();
            for (let i = 0; i < lower.length; i++) {
              vec[lower.charCodeAt(i) % 32] += 1;
            }
            const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
            return vec.map((x) => x / norm);
          });
          return { data };
        },
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      // Route local worker traffic directly to worker.fetch
      if (urlStr.startsWith('http://127.0.0.1:8787')) {
        const req = input instanceof Request ? input : new Request(urlStr, init);
        const pending = [];
        const ctx = {
          waitUntil: (p) => pending.push(Promise.resolve(p)),
          passThroughOnException: () => {},
        };
        const res = await worker.fetch(req, env, ctx);
        await Promise.allSettled(pending);
        return res;
      }

      // Mock Resend API
      if (urlStr === 'https://api.resend.com/emails') {
        const body = JSON.parse(String(init?.body || '{}'));
        sentEmails.push(body);
        return new Response(JSON.stringify({ id: `re_msg_${sentEmails.length}` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Mock RSS XML feed
      if (urlStr === 'https://mock-rss.test/feed.xml') {
        rssFetchCount++;
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Mock Engineering Blog</title>
    <link>https://mock-rss.test</link>
    <item>
      <title><![CDATA[Systems Thinking in Practice]]></title>
      <link>https://mock-rss.test/posts/systems</link>
      <author>Jane Doe</author>
      <description><![CDATA[<p>Feedback loops govern complex systems.</p><img src=x onerror=alert(1)><script>bad()</script>]]></description>
      <pubDate>Mon, 10 Nov 2026 08:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Spaced Repetition Mechanics</title>
      <link>https://mock-rss.test/posts/srs</link>
      <description>Memory decay curves and SM-2 intervals.</description>
    </item>
  </channel>
</rss>`;
        return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/rss+xml' } });
      }

      // Mock Gemini OCR
      if (urlStr.includes('generativelanguage.googleapis.com') && urlStr.includes(':generateContent')) {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify([
                        'Extracted physical page quote about compounding habits.',
                        'Second underlined passage from the book.',
                      ]),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Mock Notion Database & Pages
      if (urlStr.startsWith('https://api.notion.com/v1/databases/')) {
        return new Response(
          JSON.stringify({
            id: 'db_123',
            title: [{ plain_text: 'Mnema Test DB' }],
            properties: {
              Name: { type: 'title' },
              Author: { type: 'rich_text' },
              Note: { type: 'rich_text' },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr === 'https://api.notion.com/v1/pages') {
        const body = JSON.parse(String(init?.body || '{}'));
        notionCreatedPages.push(body);
        return new Response(JSON.stringify({ id: `page_${notionCreatedPages.length}` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return originalFetch(input, init);
    };

    // 2. Run existing test_comparison.mjs
    console.log('=== PART A: Running existing test_comparison.mjs ===');
    await import(pathToFileURL(path.join(API_DIR, 'test_comparison.mjs')).href);

    // Wait small tick if test_comparison starts async main() without top-level await
    await new Promise((r) => setTimeout(r, 400));

    // 3. Run test_core_parity.mjs
    console.log('\n=== PART B: Running test_core_parity.mjs ===');
    const { runCoreParityTests } = await import(pathToFileURL(path.join(API_DIR, 'test_core_parity.mjs')).href);
    await runCoreParityTests();

    // 4. Part C: Deep mocked tests (Cron Digest, RSS XML, OCR Gemini, Notion Sync, Workers AI, PKZIP CRC32)
    console.log('\n=== PART C: Mocked External & Scheduled Cron Tests ===');

    // Seed a highlight for digest + notion + ocr
    const srcRes = await fetch('http://127.0.0.1:8787/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Thinking in Systems', author: 'Donella Meadows', type: 'book' }),
    });
    const srcJson = await srcRes.json();
    const hlRes = await fetch('http://127.0.0.1:8787/api/highlights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_id: srcJson.data.id,
        content: 'A system is an interconnected set of elements coherently organized.',
        note: 'Core definition',
        favorite: true,
      }),
    });
    const hlJson = await hlRes.json();
    assert(hlJson.data?.id, 'Seeded highlight for Part C');

    // C1. Scheduled Daily Digest Cron
    const currentHourUtc = new Date().getUTCHours();
    await fetch('http://127.0.0.1:8787/api/email/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        digest_enabled: true,
        digest_email: 'cron-reader@example.com',
        digest_hour_utc: currentHourUtc,
        digest_count: 5,
        resend_api_key: 're_mock_key_12345',
        from_email: 'Mnema <onboarding@resend.dev>',
      }),
    });
    const scheduledPending = [];
    await worker.scheduled(
      { cron: '0 * * * *', scheduledTime: Date.now(), noRetry: () => {} },
      env,
      { waitUntil: (p) => scheduledPending.push(Promise.resolve(p)), passThroughOnException: () => {} }
    );
    await Promise.allSettled(scheduledPending);
    assert(sentEmails.length === 1, `Expected 1 scheduled email sent, got ${sentEmails.length}`);
    assert(sentEmails[0].to[0] === 'cron-reader@example.com', 'Scheduled email sent to configured digest_email');

    // Re-running scheduled in same hour should NOT send duplicate
    await worker.scheduled(
      { cron: '0 * * * *', scheduledTime: Date.now(), noRetry: () => {} },
      env,
      { waitUntil: () => {}, passThroughOnException: () => {} }
    );
    assert(sentEmails.length === 1, 'Same-hour cron run must not send duplicate digest');
    console.log('✅ PASS: Scheduled Daily Digest Cron & deduplication');

    // C2. Send single Highlight + Source via Resend
    const sendHl = await fetch('http://127.0.0.1:8787/api/email/send-highlight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ highlight_id: hlJson.data.id, to: 'friend@example.com' }),
    });
    assert(sendHl.status === 200, 'POST /api/email/send-highlight succeeded');
    const sendSrc = await fetch('http://127.0.0.1:8787/api/email/send-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: srcJson.data.id, to: 'friend@example.com' }),
    });
    assert(sendSrc.status === 200, 'POST /api/email/send-source succeeded');
    assert(sentEmails.length === 3, 'All 3 emails recorded via Resend');
    console.log('✅ PASS: Send Highlight & Send Source Summary via Resend');

    // C3. RSS Feed Subscribe + Sync + Deduplication + Delete
    rssFetchCount = 0;
    const rssAdd = await fetch('http://127.0.0.1:8787/api/rss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://mock-rss.test/feed.xml', sync: true }),
    });
    const rssJson = await rssAdd.json();
    assert(rssAdd.status === 201 && rssJson.data.addedArticles === 2, `Expected 2 RSS articles imported, got ${JSON.stringify(rssJson)}`);
    assert(rssFetchCount === 1, `Expected POST /api/rss to fetch feed once, fetched ${rssFetchCount} times`);

    // Verify RSS XSS sanitization on stored source content_html
    const srcListRes = await fetch('http://127.0.0.1:8787/api/sources?type=article');
    const srcListJson = await srcListRes.json();
    const rssStored = srcListJson.data.find((s) => s.url === 'https://mock-rss.test/posts/systems');
    assert(rssStored, 'RSS imported article found via /api/sources');
    const rssDetailRes = await fetch(`http://127.0.0.1:8787/api/sources/${rssStored.id}`);
    const rssDetailJson = await rssDetailRes.json();
    const storedHtml = rssDetailJson.data?.source?.content_html || '';
    assert(!storedHtml.includes('<script'), `RSS content_html retained <script>: ${storedHtml}`);
    assert(!/onerror\s*=/i.test(storedHtml), `RSS content_html retained onerror=: ${storedHtml}`);

    const rssSyncAgain = await fetch(`http://127.0.0.1:8787/api/rss/${rssJson.data.feed.id}/sync`, { method: 'POST' });
    const rssSyncJson = await rssSyncAgain.json();
    assert(rssSyncJson.data.addedArticles === 0, 'Re-syncing RSS skips already-imported article URLs');
    const rssDel = await fetch(`http://127.0.0.1:8787/api/rss/${rssJson.data.feed.id}`, { method: 'DELETE' });
    assert(rssDel.status === 200, 'Deleted RSS feed');
    console.log('✅ PASS: RSS Subscribe, Sanitized Sync, Deduplication & Delete');

    // C4. Book Page OCR via Gemini Vision
    const samplePngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const ocrRes = await fetch('http://127.0.0.1:8787/api/ai/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Gemini-Key': 'mock-gemini-key' },
      body: JSON.stringify({ imageBase64: samplePngBase64, mimeType: 'image/png' }),
    });
    const ocrJson = await ocrRes.json();
    assert(
      ocrRes.status === 200 &&
        ocrJson.data?.text?.includes('compounding habits') &&
        Array.isArray(ocrJson.data?.passages) &&
        ocrJson.data.passages.length === 2,
      `OCR returned unexpected payload: ${JSON.stringify(ocrJson)}`
    );
    console.log('✅ PASS: Book Page OCR');

    // C5. Notion Test + Sync
    await fetch('http://127.0.0.1:8787/api/email/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notion_token: 'secret_notion_mock', notion_database_id: 'db_123' }),
    });
    const notionTest = await fetch('http://127.0.0.1:8787/api/integrations/notion/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert(notionTest.status === 200, 'Notion connection test passed');
    const notionSync = await fetch('http://127.0.0.1:8787/api/integrations/notion/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: false }),
    });
    const notionSyncJson = await notionSync.json();
    assert(notionSync.status === 200 && notionSyncJson.data.syncedCount >= 1, 'Notion synced highlights');
    assert(notionCreatedPages.length >= 1, 'Notion API /v1/pages called');
    console.log('✅ PASS: Notion Connection Test & Sync');

    // C6. Workers AI Semantic Search
    enableWorkersAiMock = true;
    const waiSync = await fetch('http://127.0.0.1:8787/api/search/embeddings/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchLimit: 50 }),
    });
    assert(waiSync.status === 200, 'Workers AI embeddings sync ok');
    const waiSem = await fetch('http://127.0.0.1:8787/api/search/semantic?q=interconnected+system');
    const waiSemJson = await waiSem.json();
    assert(waiSem.status === 200 && waiSemJson.data?.provider === 'workers_ai', `Expected workers_ai provider, got ${waiSemJson.data?.provider}`);
    assert(waiSemJson.data.highlights.length >= 1, 'Workers AI semantic search returned ranked results');
    console.log('✅ PASS: Workers AI Semantic Embeddings & Search');

    // C7. PKZIP CRC-32 Verification
    const zipRes = await fetch('http://127.0.0.1:8787/api/export/obsidian');
    const zipBuf = Buffer.from(await zipRes.arrayBuffer());
    let offset = 0;
    let entryCount = 0;
    while (offset + 30 <= zipBuf.length && zipBuf.readUInt32LE(offset) === 0x04034b50) {
      const crc = zipBuf.readUInt32LE(offset + 14);
      const compSize = zipBuf.readUInt32LE(offset + 18);
      const nameLen = zipBuf.readUInt16LE(offset + 26);
      const extraLen = zipBuf.readUInt16LE(offset + 28);
      const dataStart = offset + 30 + nameLen + extraLen;
      const fileData = zipBuf.subarray(dataStart, dataStart + compSize);
      const actualCrc = zlib.crc32(fileData) >>> 0;
      assert(crc === actualCrc, `ZIP entry CRC mismatch: expected ${actualCrc}, got ${crc}`);
      entryCount++;
      offset = dataStart + compSize;
    }
    assert(entryCount >= 2, `Expected >=2 files in Obsidian ZIP, parsed ${entryCount}`);
    console.log(`✅ PASS: Obsidian PKZIP CRC-32 integrity verified (${entryCount} files)`);

    console.log('\n🎉 ALL IN-PROCESS WORKER & PARITY TESTS PASSED!\n');
  } finally {
    if (fs.existsSync(BUNDLE_OUT)) {
      fs.unlinkSync(BUNDLE_OUT);
    }
  }
}

run().catch((err) => {
  console.error('❌ Test runner failed:', err);
  process.exit(1);
});
