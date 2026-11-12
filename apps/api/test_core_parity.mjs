// Comprehensive automated integration tests for the 4 Core Parity feature clusters
// Run against local or remote worker: BASE_URL=http://127.0.0.1:8787 node apps/api/test_core_parity.mjs

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const BASE_ORIGIN = process.env.BASE_URL || 'http://127.0.0.1:8787';
const BASE = `${BASE_ORIGIN}/api`;

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function test(name, fn) {
  process.stdout.write(`🧪 Testing: ${name}... `);
  try {
    await fn();
    console.log('✅ PASS');
    passed++;
  } catch (err) {
    console.log('❌ FAIL');
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

async function jsonReq(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, json, headers: res.headers };
}

function buildMinimalPdf(textContent, compressFlate = false) {
  const escaped = textContent.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const streamBody = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const rawStreamBytes = Buffer.from(streamBody, 'latin1');
  const streamBytes = compressFlate ? zlib.deflateSync(rawStreamBytes) : rawStreamBytes;
  const streamDict = compressFlate
    ? `/Filter /FlateDecode /Length ${streamBytes.length}`
    : `/Length ${streamBytes.length}`;

  const chunks = [Buffer.from('%PDF-1.4\n', 'latin1')];
  let cursor = chunks[0].length;
  const offsets = [];

  const pushObj = (buf) => {
    offsets.push(cursor);
    chunks.push(buf);
    cursor += buf.length;
  };

  pushObj(Buffer.from('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n', 'latin1'));
  pushObj(Buffer.from('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n', 'latin1'));
  pushObj(Buffer.from('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj\n', 'latin1'));
  pushObj(
    Buffer.concat([
      Buffer.from(`4 0 obj << ${streamDict} >>\nstream\n`, 'latin1'),
      streamBytes,
      Buffer.from('\nendstream\nendobj\n', 'latin1'),
    ])
  );

  const xrefPos = cursor;
  let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer << /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}

export async function runCoreParityTests() {
  passed = 0;
  failed = 0;
  console.log(`\n🚀 Running Core Parity Tests against ${BASE_ORIGIN}\n`);

  let createdSourceId = null;
  let createdHighlightId = null;
  let newsletterSecret = null;
  let telegramSecret = null;
  let highlightShareSlug = null;
  let sourceShareSlug = null;

  // 0. Health & Seed baseline data
  await test('0. Health & baseline seed source+highlight creation', async () => {
    const health = await jsonReq('/health');
    assert(health.status === 200 && health.json.status === 'ok', 'Health check should return ok');

    const src = await jsonReq('/sources', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Deep Work (Test Parity)',
        author: 'Cal Newport',
        type: 'book',
        reading_status: 'reading',
      }),
    });
    assert(src.status === 201 && src.json.data?.id, 'Create book source');
    createdSourceId = src.json.data.id;

    const hl = await jsonReq('/highlights', {
      method: 'POST',
      body: JSON.stringify({
        source_id: createdSourceId,
        content: 'Clarity about what matters provides clarity about what does not.',
        note: 'Focus & deliberate practice note <script>alert(1)</script>',
        color: 'yellow',
        location: '42',
        favorite: true,
      }),
    });
    assert(hl.status === 201 && hl.json.data?.id, 'Create highlight');
    createdHighlightId = hl.json.data.id;
  });

  // 1. Cluster 1: Email Settings, Masking & Digest Preview
  await test('1. Email Settings CRUD & API key masking', async () => {
    const initial = await jsonReq('/email/settings');
    assert(initial.status === 200 && initial.json.data, 'GET /email/settings');
    assert(initial.json.data.newsletter_secret, 'Should expose newsletter_secret');
    assert(initial.json.data.telegram_webhook_secret, 'Should expose telegram_webhook_secret');
    newsletterSecret = initial.json.data.newsletter_secret;
    telegramSecret = initial.json.data.telegram_webhook_secret;

    const updated = await jsonReq('/email/settings', {
      method: 'PUT',
      body: JSON.stringify({
        digest_enabled: true,
        digest_email: 'reader@example.com',
        digest_hour_utc: 9,
        digest_count: 3,
        resend_api_key: '',
        from_email: 'Mnema Test <onboarding@resend.dev>',
      }),
    });
    assert(updated.status === 200, 'PUT /email/settings');
    assert(updated.json.data.digest_enabled === true, 'digest_enabled persisted');
    assert(updated.json.data.digest_email === 'reader@example.com', 'digest_email persisted');
    assert(updated.json.data.digest_hour_utc === 9, 'digest_hour_utc persisted');
    assert(updated.json.data.digest_count === 3, 'digest_count persisted');
  });

  await test('2. Daily Digest HTML Preview & XSS Escaping', async () => {
    const prev = await jsonReq('/email/digest/preview?count=5');
    assert(prev.status === 200 && prev.json.data, 'GET /email/digest/preview');
    assert(prev.json.data.highlightsCount >= 1, 'Preview should include seeded highlight');
    assert(prev.json.data.html.includes('Clarity about what matters'), 'Preview contains quote');
    assert(!prev.json.data.html.includes('<script>alert(1)</script>'), 'Preview MUST escape <script> in notes');
  });

  await test('3. Email send validation (missing Resend key / bad target)', async () => {
    const noKeyHl = await jsonReq('/email/send-highlight', {
      method: 'POST',
      body: JSON.stringify({ highlight_id: createdHighlightId, to: 'reader@example.com' }),
    });
    assert(noKeyHl.status === 400, `Expected 400 when Resend API key unconfigured, got ${noKeyHl.status}`);

    const missingSrc = await jsonReq('/email/send-source', {
      method: 'POST',
      body: JSON.stringify({ source_id: 'nonexistent-id-999', to: 'reader@example.com' }),
    });
    assert(missingSrc.status === 400 || missingSrc.status === 404, 'Should reject nonexistent source cleanly');

    const logs = await jsonReq('/email/logs');
    assert(logs.status === 200 && Array.isArray(logs.json.data), 'GET /email/logs returns array');
  });

  await test('4. Newsletter Inbox Webhook (JSON + Raw MIME + Invalid Secret)', async () => {
    const badSecret = await jsonReq('/webhooks/newsletter/wrong-secret-xyz', {
      method: 'POST',
      body: JSON.stringify({ from: 'news@example.com', subject: 'Bad', text: 'Nope' }),
    });
    assert(badSecret.status === 401 || badSecret.status === 403, `Expected 401/403 on bad secret, got ${badSecret.status}`);

    const jsonHook = await jsonReq(`/webhooks/newsletter/${encodeURIComponent(newsletterSecret)}`, {
      method: 'POST',
      body: JSON.stringify({
        from: 'Stratechery <ben@stratechery.com>',
        subject: 'Weekly AI & Platforms Dispatch',
        html: '<p>Great analysis of distribution moats.</p><script>evil()</script>',
      }),
    });
    assert(jsonHook.status === 201 && jsonHook.json.data?.id, 'Newsletter JSON webhook creates article');
    assert(jsonHook.json.data.type === 'article', 'Newsletter stored as article');
    assert(!jsonHook.json.data.content_html.includes('<script>'), 'Newsletter HTML strips <script>');

    const rawMime = [
      'From: Morning Dispatch <editor@dispatch.test>',
      'Subject: =?UTF-8?Q?MIME_Test_Newsletter?=',
      'Content-Type: text/html; charset="utf-8"',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<div>Hello=20MIME=20World!=0A<p>Second paragraph.</p></div>',
    ].join('\r\n');
    const mimeRes = await fetch(`${BASE}/webhooks/newsletter/${encodeURIComponent(newsletterSecret)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'message/rfc822' },
      body: rawMime,
    });
    const mimeJson = await mimeRes.json();
    assert(mimeRes.status === 201 && mimeJson.data?.name.includes('MIME Test Newsletter'), 'Raw MIME newsletter parsed & saved');
  });

  // 2. Cluster 2: CSV Imports, PDF Extraction, RSS Validation, OCR Validation
  await test('5. CSV Importers (Readwise + Goodreads + Apple Books + Deduplication)', async () => {
    const emptyCsv = await jsonReq('/import/csv', {
      method: 'POST',
      body: JSON.stringify({ csv: '' }),
    });
    assert(emptyCsv.status === 400, 'Empty CSV returns 400');

    const readwiseCsv = [
      'Highlight,Book Title,Book Author,Amazon Book ID,Note,Color,Tags,Location Type,Location,Highlighted at',
      '"We are what we repeatedly do, then excellence is a habit.","Nicomachean Ethics","Aristotle","","Core virtue quote",yellow,"philosophy, ethics",page,14,2026-01-01',
      '"Knowing yourself is the beginning of all wisdom.","Nicomachean Ethics","Aristotle","","",blue,"philosophy",page,28,2026-01-02',
    ].join('\n');

    const rw1 = await jsonReq('/import/csv', {
      method: 'POST',
      body: JSON.stringify({ csv: readwiseCsv, format: 'auto' }),
    });
    assert(rw1.status === 200 && rw1.json.data.highlightsImported === 2, `Expected 2 Readwise highlights, got ${JSON.stringify(rw1.json)}`);
    assert(rw1.json.data.detectedFormat === 'readwise', 'Auto-detected readwise format');

    // Re-import same CSV should deduplicate
    const rw2 = await jsonReq('/import/csv', {
      method: 'POST',
      body: JSON.stringify({ csv: readwiseCsv, format: 'readwise' }),
    });
    assert(rw2.status === 200 && rw2.json.data.highlightsImported === 0, 'Duplicate Readwise CSV skipped');

    const goodreadsCsv = [
      'Book Id,Title,Author,My Rating,Date Read,My Review',
      '12345,"The Almanack of Naval Ravikant","Eric Jorgenson",5,2026/02/10,"Seek wealth, not money or status."',
    ].join('\n');
    const gr = await jsonReq('/import/csv', {
      method: 'POST',
      body: JSON.stringify({ csv: goodreadsCsv, format: 'auto' }),
    });
    assert(gr.status === 200 && gr.json.data.detectedFormat === 'goodreads', 'Auto-detected goodreads format');
    assert(gr.json.data.highlightsImported === 1, 'Imported Goodreads review');
  });

  await test('6. PDF Upload & Pure-TS Stream Text Extraction', async () => {
    const emptyPdf = await jsonReq('/import/pdf', {
      method: 'POST',
      body: JSON.stringify({ title: 'Empty' }),
    });
    assert(emptyPdf.status === 400, 'Empty PDF payload returns 400');

    const pdfBytes = buildMinimalPdf('Knowledge compounds like interest over decades.');
    const formData = new FormData();
    formData.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'compounding-essay.pdf');
    formData.append('author', 'Morgan Housel');
    const pdfRes = await fetch(`${BASE}/import/pdf`, {
      method: 'POST',
      body: formData,
    });
    const pdfJson = await pdfRes.json();
    assert(pdfRes.status === 201 && pdfJson.data?.id, `PDF upload failed: ${JSON.stringify(pdfJson)}`);
    assert(
      pdfJson.data.content_html.includes('Knowledge compounds like interest'),
      `PDF extracted text missing in content_html: ${pdfJson.data.content_html}`
    );

    // FlateDecode compressed stream containing ET/BT substrings inside words (LETTER, SECRET, SUBTOTAL, GET)
    const flatePdfBytes = buildMinimalPdf('SECRET LETTER SUBTOTAL GET BETWEEN', true);
    const flateForm = new FormData();
    flateForm.append('file', new Blob([flatePdfBytes], { type: 'application/pdf' }), 'compressed-et-test.pdf');
    const flateRes = await fetch(`${BASE}/import/pdf`, {
      method: 'POST',
      body: flateForm,
    });
    const flateJson = await flateRes.json();
    assert(flateRes.status === 201 && flateJson.data?.id, `Compressed PDF upload failed: ${JSON.stringify(flateJson)}`);
    assert(
      flateJson.data.content_html.includes('SECRET LETTER SUBTOTAL GET BETWEEN'),
      `FlateDecode PDF truncated BT/ET substrings: ${flateJson.data.content_html}`
    );
    await jsonReq(`/sources/${flateJson.data.id}`, { method: 'DELETE' });
    await jsonReq(`/sources/${pdfJson.data.id}`, { method: 'DELETE' });
  });

  await test('7. RSS & OCR Input Validation', async () => {
    const badRss = await jsonReq('/rss', {
      method: 'POST',
      body: JSON.stringify({ url: 'ftp://invalid-protocol.example/feed.xml' }),
    });
    assert(badRss.status === 400, `Expected 400 for non-http RSS URL, got ${badRss.status}`);

    const listRss = await jsonReq('/rss');
    assert(listRss.status === 200 && Array.isArray(listRss.json.data), 'GET /rss returns array');

    const noImgOcr = await jsonReq('/ai/ocr', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert(noImgOcr.status === 400, `Expected 400 when image missing, got ${noImgOcr.status}`);

    const noKeyOcr = await jsonReq('/ai/ocr', {
      method: 'POST',
      body: JSON.stringify({ imageBase64: 'ZmFrZQ==', mimeType: 'image/png' }),
    });
    assert(noKeyOcr.status === 400, `Expected 400 when Gemini key missing, got ${noKeyOcr.status}`);
  });

  // 3. Cluster 3: Integrations (MCP, Telegram, Notion, Obsidian ZIP) & Public Shares
  await test('8. MCP Endpoint, Dynamic Tool List & tools/call', async () => {
    const mcp = await jsonReq('/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert(mcp.status === 200 && Array.isArray(mcp.json.result?.tools), 'MCP tools/list works');
    assert(mcp.json.result.tools.length >= 6, 'MCP exposes expected tools including search_semantic and add_tags');

    const saveArt = await jsonReq('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'save_article',
          arguments: { url: 'https://example.invalid/mcp-saved-article', status: 'later' },
        },
      }),
    });
    assert(saveArt.status === 200 && saveArt.json.result?.content?.[0]?.text, `MCP save_article failed: ${JSON.stringify(saveArt.json)}`);
    const savedInfo = JSON.parse(saveArt.json.result.content[0].text);
    assert(savedInfo.id && savedInfo.status === 'later', 'MCP save_article persisted source');

    const addHl = await jsonReq('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'add_highlight',
          arguments: { source_id: savedInfo.id, content: 'MCP captured quote', note: 'via MCP' },
        },
      }),
    });
    assert(addHl.status === 200 && !addHl.json.error, `MCP add_highlight failed: ${JSON.stringify(addHl.json)}`);

    // Test new MCP tool: add_tags
    const addTags = await jsonReq('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'add_tags',
          arguments: { tags: ['mcp-tag-1', 'mcp-tag-2'] },
        },
      }),
    });
    assert(addTags.status === 200 && !addTags.json.error, `MCP add_tags failed: ${JSON.stringify(addTags.json)}`);
    const tagRes = JSON.parse(addTags.json.result.content[0].text);
    assert(tagRes.success && tagRes.tags.length === 2, 'MCP add_tags succeeded');

    // Test new MCP tool: search_semantic
    const semSearch = await jsonReq('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'search_semantic',
          arguments: { query: 'captured quote' },
        },
      }),
    });
    assert(semSearch.status === 200 && !semSearch.json.error, `MCP search_semantic failed: ${JSON.stringify(semSearch.json)}`);

    await jsonReq(`/sources/${savedInfo.id}`, { method: 'DELETE' });
  });

  await test('9. Obsidian Vault .zip Binary Export', async () => {
    const res = await fetch(`${BASE}/export/obsidian`);
    assert(res.status === 200, `Expected 200 from /export/obsidian, got ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    assert(ct.includes('application/zip'), `Expected application/zip content-type, got ${ct}`);
    const buf = Buffer.from(await res.arrayBuffer());
    assert(buf.length > 100, 'ZIP archive should not be empty');
    // PK\x03\x04 local file header magic bytes
    assert(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04, 'Valid PKZIP header');
    // Contains End of Central Directory PK\x05\x06 and exported markdown filename
    assert(buf.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06])), 'Valid PKZIP EOCD marker');
    assert(buf.includes('Deep Work'), 'Obsidian ZIP contains exported source note');
  });

  await test('10. Telegram Webhook & Capture Simulation', async () => {
    const badTg = await jsonReq('/webhooks/telegram/invalid-secret', {
      method: 'POST',
      body: JSON.stringify({ message: { chat: { id: 123 }, text: 'hi' } }),
    });
    assert(badTg.status === 401 || badTg.status === 403, 'Telegram rejects invalid secret');

    const tgSave = await jsonReq(`/webhooks/telegram/${encodeURIComponent(telegramSecret)}`, {
      method: 'POST',
      body: JSON.stringify({
        message: {
          chat: { id: 987654 },
          text: 'The obstacle is the way — captured from Telegram.',
        },
      }),
    });
    assert(tgSave.status === 200 && tgSave.json.ok === true, 'Telegram webhook saved quote');

    const tgTest = await jsonReq('/integrations/telegram/test', {
      method: 'POST',
      body: JSON.stringify({ text: 'Simulated Telegram highlight test quote' }),
    });
    assert(tgTest.status === 200 && tgTest.json.data?.replyText, 'Telegram simulator returns reply');

    // Allowed chat ID enforcement (including missing chat.id)
    await jsonReq('/email/settings', {
      method: 'PUT',
      body: JSON.stringify({ telegram_allowed_chat_id: '555777' }),
    });
    const missingChatTg = await jsonReq(`/webhooks/telegram/${encodeURIComponent(telegramSecret)}`, {
      method: 'POST',
      body: JSON.stringify({ message: { text: 'Sneaky no-chat-id message' } }),
    });
    assert(missingChatTg.status === 403, `Expected 403 when chat.id missing under allowlist, got ${missingChatTg.status}`);
    const wrongChatTg = await jsonReq(`/webhooks/telegram/${encodeURIComponent(telegramSecret)}`, {
      method: 'POST',
      body: JSON.stringify({ message: { chat: { id: 111222 }, text: 'Wrong chat id' } }),
    });
    assert(wrongChatTg.status === 403, `Expected 403 for unauthorized chat id, got ${wrongChatTg.status}`);
    await jsonReq('/email/settings', {
      method: 'PUT',
      body: JSON.stringify({ telegram_allowed_chat_id: '' }),
    });
  });

  await test('11. Notion Test Validation (missing credentials)', async () => {
    const notion = await jsonReq('/integrations/notion/test', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert(notion.status === 400, `Expected 400 when Notion unconfigured, got ${notion.status}`);
  });

  await test('12. Public Share Links (Highlight + Source + View Count + Revoke)', async () => {
    const notFound = await jsonReq('/shares', {
      method: 'POST',
      body: JSON.stringify({ target_type: 'highlight', target_id: 'does-not-exist' }),
    });
    assert(notFound.status === 404, 'Share nonexistent highlight returns 404');

    const hlShare = await jsonReq('/shares', {
      method: 'POST',
      body: JSON.stringify({ target_type: 'highlight', target_id: createdHighlightId }),
    });
    assert(hlShare.status === 201 && hlShare.json.data?.slug, 'Created highlight share link');
    highlightShareSlug = hlShare.json.data.slug;

    const pubHl1 = await jsonReq(`/public/share/${encodeURIComponent(highlightShareSlug)}`);
    assert(pubHl1.status === 200 && pubHl1.json.data?.target_type === 'highlight', 'Fetched public highlight share');
    assert(pubHl1.json.data.highlight?.id === createdHighlightId, 'Returned exact highlight');
    assert(pubHl1.json.data.view_count >= 1, 'Incremented view_count');

    const srcShare = await jsonReq('/shares', {
      method: 'POST',
      body: JSON.stringify({ target_type: 'source', target_id: createdSourceId }),
    });
    assert(srcShare.status === 201 && srcShare.json.data?.slug, 'Created source share link');
    sourceShareSlug = srcShare.json.data.slug;

    const pubSrc = await jsonReq(`/public/share/${encodeURIComponent(sourceShareSlug)}`);
    assert(pubSrc.status === 200 && pubSrc.json.data?.target_type === 'source', 'Fetched public source share');
    assert(Array.isArray(pubSrc.json.data.highlights) && pubSrc.json.data.highlights.length >= 1, 'Included source highlights');

    const revoke = await jsonReq(`/shares/${encodeURIComponent(highlightShareSlug)}`, {
      method: 'DELETE',
    });
    assert(revoke.status === 200, 'Revoked highlight share');

    const afterRevoke = await jsonReq(`/public/share/${encodeURIComponent(highlightShareSlug)}`);
    assert(afterRevoke.status === 404, 'Revoked share returns 404');

    // View count must NOT increment when target source is deleted
    const tempSrc = await jsonReq('/sources', {
      method: 'POST',
      body: JSON.stringify({ name: 'Ephemeral Share Book', type: 'book' }),
    });
    const tempShare = await jsonReq('/shares', {
      method: 'POST',
      body: JSON.stringify({ target_type: 'source', target_id: tempSrc.json.data.id }),
    });
    const tempSlug = tempShare.json.data.slug;
    await jsonReq(`/sources/${tempSrc.json.data.id}`, { method: 'DELETE' });
    const deadView = await jsonReq(`/public/share/${encodeURIComponent(tempSlug)}`);
    assert(deadView.status === 404, 'Deleted target share returns 404');
    const shareList = await jsonReq('/shares');
    const trackedShare = shareList.json.data.find((s) => s.slug === tempSlug);
    assert(trackedShare && trackedShare.view_count === 0, `404 share incremented view_count to ${trackedShare?.view_count}`);
    await jsonReq(`/shares/${encodeURIComponent(tempSlug)}`, { method: 'DELETE' });
  });

  // 4. Cluster 4: Semantic Search & Similarity
  await test('13. Semantic Embeddings Sync, Search & Similar Highlights', async () => {
    const sync = await jsonReq('/search/embeddings/sync', {
      method: 'POST',
      body: JSON.stringify({ batchLimit: 50 }),
    });
    assert(sync.status === 200 && sync.json.data?.indexedCount >= 1, `Embeddings sync processed highlights: ${JSON.stringify(sync.json)}`);

    const status = await jsonReq('/search/embeddings/status');
    assert(status.status === 200 && status.json.data.indexedHighlights >= 1, 'Embeddings status reflects indexed highlights');

    const sem = await jsonReq('/search/semantic?q=' + encodeURIComponent('focus deliberate clarity matters'));
    assert(sem.status === 200 && Array.isArray(sem.json.data?.highlights), 'Semantic search returned highlights');
    assert(sem.json.data.highlights.length >= 1, 'Semantic search matched seeded highlight');
    assert(typeof sem.json.data.highlights[0].similarity === 'number', 'Results include numeric similarity score');

    const sim = await jsonReq(`/search/similar/${encodeURIComponent(createdHighlightId)}`);
    assert(sim.status === 200 && Array.isArray(sim.json.data?.similar), 'Similar highlights endpoint succeeded');
    assert(!sim.json.data.similar.some((h) => h.id === createdHighlightId), 'Similar highlights excludes target highlight itself');
  });

  // 4. Cluster 4: Remote MCP OAuth 2.1, Multi-turn Ask AI & Extension Sync
  await test('14. Remote MCP OAuth 2.1 Flow (RFC 8414, RFC 9728, DCR, PIN Authorize & PKCE Token)', async () => {
    // 1. RFC 9728 Protected Resource Metadata
    const protRes = await fetch(`${BASE_ORIGIN}/.well-known/oauth-protected-resource`);
    assert(protRes.status === 200, `Expected 200 from protected resource metadata, got ${protRes.status}`);
    const protJson = await protRes.json();
    assert(protJson.resource && Array.isArray(protJson.authorization_servers), 'Protected resource metadata valid');

    // 2. RFC 8414 Authorization Server Metadata
    const authRes = await fetch(`${BASE_ORIGIN}/.well-known/oauth-authorization-server`);
    assert(authRes.status === 200, `Expected 200 from auth server metadata, got ${authRes.status}`);
    const authJson = await authRes.json();
    assert(authJson.authorization_endpoint && authJson.token_endpoint && authJson.registration_endpoint, 'Auth server metadata valid');

    // 3. Dynamic Client Registration (RFC 7591)
    const regRes = await fetch(`${BASE_ORIGIN}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'ChatGPT Web Client',
        redirect_uris: ['https://chatgpt.com/api/mcp/oauth/callback'],
      }),
    });
    assert(regRes.status === 201, `Client registration failed with ${regRes.status}`);
    const regJson = await regRes.json();
    assert(regJson.client_id && regJson.client_id.startsWith('mnema_client_'), 'Client ID issued');

    // 4. GET /authorize
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const authPageRes = await fetch(
      `${BASE_ORIGIN}/authorize?client_id=${regJson.client_id}&redirect_uri=https://chatgpt.com/api/mcp/oauth/callback&response_type=code&state=test_state_123&code_challenge=${challenge}&code_challenge_method=S256`
    );
    assert(authPageRes.status === 200, 'Authorize form page loads successfully');
    const authHtml = await authPageRes.text();
    assert(authHtml.includes('PIN') || authHtml.includes('Passphrase'), 'Authorize page contains PIN prompt');

    // 5. POST /authorize with wrong PIN
    const wrongAuthRes = await fetch(`${BASE_ORIGIN}/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pin: 'wrong_pin_value',
        client_id: regJson.client_id,
        redirect_uri: 'https://chatgpt.com/api/mcp/oauth/callback',
        state: 'test_state_123',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }),
    });
    assert(wrongAuthRes.status === 401, `Expected 401 on incorrect PIN, got ${wrongAuthRes.status}`);

    // 6. POST /authorize with valid default PIN ("mnema123")
    const validAuthRes = await fetch(`${BASE_ORIGIN}/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'manual',
      body: JSON.stringify({
        pin: 'mnema123',
        client_id: regJson.client_id,
        redirect_uri: 'https://chatgpt.com/api/mcp/oauth/callback',
        state: 'test_state_123',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }),
    });
    assert(validAuthRes.status === 302, `Expected 302 redirect on successful PIN, got ${validAuthRes.status}`);
    const redirectLocation = validAuthRes.headers.get('location') || '';
    assert(redirectLocation.includes('code=') && redirectLocation.includes('state=test_state_123'), 'Redirect URL contains authorization code and state');
    const codeParam = new URL(redirectLocation).searchParams.get('code');
    assert(Boolean(codeParam), 'Extracted authorization code');

    // 7. POST /token - Redirect URI mismatch check (RFC 6749 Section 4.1.3)
    const mismatchRes = await fetch(`${BASE_ORIGIN}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: codeParam,
        client_id: regJson.client_id,
        redirect_uri: 'https://attacker.invalid/callback',
        code_verifier: verifier,
      }),
    });
    assert(mismatchRes.status === 400, 'Expected 400 on redirect_uri mismatch');

    // 7b. POST /token - Valid Token Exchange with PKCE verifier
    const tokenRes = await fetch(`${BASE_ORIGIN}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: codeParam,
        client_id: regJson.client_id,
        redirect_uri: 'https://chatgpt.com/api/mcp/oauth/callback',
        code_verifier: verifier,
      }),
    });
    assert(tokenRes.status === 200, `Token exchange failed with ${tokenRes.status}`);
    const tokenJson = await tokenRes.json();
    assert(tokenJson.access_token && tokenJson.token_type === 'Bearer', 'Access token issued');
    assert(tokenJson.refresh_token, 'Refresh token issued');

    // 7c. Authorization: Basic header token exchange
    const secondAuth = await fetch(`${BASE_ORIGIN}/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'manual',
      body: JSON.stringify({
        pin: 'mnema123',
        client_id: regJson.client_id,
        redirect_uri: 'https://chatgpt.com/api/mcp/oauth/callback',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }),
    });
    const code2 = new URL(secondAuth.headers.get('location')).searchParams.get('code');
    const basicCreds = Buffer.from(`${regJson.client_id}:${regJson.client_secret}`).toString('base64');
    const basicTokenRes = await fetch(`${BASE_ORIGIN}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${basicCreds}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code2,
        redirect_uri: 'https://chatgpt.com/api/mcp/oauth/callback',
        code_verifier: verifier,
      }),
    });
    assert(basicTokenRes.status === 200, `Basic Auth token exchange failed with ${basicTokenRes.status}`);

    // 8. Protected MCP call with valid OAuth Bearer token
    const mcpAuthed = await fetch(`${BASE_ORIGIN}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenJson.access_token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 100, method: 'tools/list' }),
    });
    assert(mcpAuthed.status === 200, `Authed MCP call returned ${mcpAuthed.status}`);

    // 9. Protected MCP call with invalid Bearer token
    const mcpInvalid = await fetch(`${BASE_ORIGIN}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid_tampered_token_999',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 101, method: 'tools/list' }),
    });
    assert(mcpInvalid.status === 401, `Expected 401 for invalid Bearer token, got ${mcpInvalid.status}`);
    assert(Boolean(mcpInvalid.headers.get('www-authenticate')), 'Includes WWW-Authenticate challenge header');

    // 10. MCP Protocol initialize, ping, notifications/initialized
    const mcpInit = await fetch(`${BASE_ORIGIN}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenJson.access_token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 102,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05' },
      }),
    });
    assert(mcpInit.status === 200, `Expected 200 from MCP initialize, got ${mcpInit.status}`);
    const initJson = await mcpInit.json();
    assert(initJson.result?.serverInfo?.name === 'mnema-mcp-server', 'MCP initialize returned valid serverInfo');
    assert(initJson.result?.protocolVersion === '2024-11-05', 'MCP initialize returned protocolVersion');

    const mcpPing = await fetch(`${BASE_ORIGIN}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenJson.access_token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 103, method: 'ping' }),
    });
    assert(mcpPing.status === 200, 'MCP ping returns 200');

    const mcpNotif = await fetch(`${BASE_ORIGIN}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenJson.access_token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    assert(mcpNotif.status === 204 || mcpNotif.status === 200, 'MCP notifications/initialized handled');
  });

  await test('15. Multi-turn Ask AI Highlight Conversation (/api/ai/ask-highlight & threads)', async () => {
    // 1. First Turn: Ask initial question on highlight
    const firstTurn = await jsonReq('/ai/ask-highlight', {
      method: 'POST',
      body: JSON.stringify({
        highlightId: createdHighlightId,
        highlightContent: 'You do not rise to the level of your goals. You fall to the level of your systems.',
        sourceTitle: 'Atomic Habits',
        message: 'What is the practical implication of this for daily work?',
      }),
    });
    assert(firstTurn.status === 200 && firstTurn.json.data?.threadId, `First turn failed: ${JSON.stringify(firstTurn.json)}`);
    const threadId = firstTurn.json.data.threadId;
    assert(firstTurn.json.data.messages.length === 2, `Expected 2 messages (user + assistant), got ${firstTurn.json.data.messages.length}`);
    assert(firstTurn.json.data.answer && typeof firstTurn.json.data.answer === 'string', 'Received AI answer');

    // 2. Second Turn: Follow-up question in the same thread
    const secondTurn = await jsonReq('/ai/ask-highlight', {
      method: 'POST',
      body: JSON.stringify({
        threadId,
        highlightId: createdHighlightId,
        highlightContent: 'You do not rise to the level of your goals. You fall to the level of your systems.',
        sourceTitle: 'Atomic Habits',
        message: 'How should I redesign my morning routine around this principle?',
      }),
    });
    assert(secondTurn.status === 200 && secondTurn.json.data?.threadId === threadId, 'Follow-up maintained threadId');
    assert(secondTurn.json.data.messages.length === 4, `Expected 4 messages in conversation history, got ${secondTurn.json.data.messages.length}`);

    // 3. GET /api/ai/threads/:id
    const threadFetch = await jsonReq(`/ai/threads/${threadId}`);
    assert(threadFetch.status === 200 && threadFetch.json.data?.id === threadId, 'Retrieved AI thread by id');
    assert(Array.isArray(threadFetch.json.data.messages) && threadFetch.json.data.messages.length === 4, 'Thread history has 4 persisted messages in D1');
  });

  await test('16. Browser Extension Endpoints (/api/import/json batch sync & direct highlight)', async () => {
    // 1. Kindle Sync batch import
    const kindleImport = await jsonReq('/import/json', {
      method: 'POST',
      body: JSON.stringify([
        {
          title: 'Thinking, Fast and Slow',
          author: 'Daniel Kahneman',
          type: 'book',
          url: 'https://read.amazon.com/notebook?asin=B00555X8OA',
          highlights: [
            { text: 'A reliable way to make people believe in falsehoods is frequent repetition.', location: 'Page 62' },
            { text: 'We can be blind to the obvious, and we are also blind to our blindness.', location: 'Page 24' },
          ],
        },
      ]),
    });
    assert(kindleImport.status === 200 && kindleImport.json.totalImported === 2, `Kindle batch import failed: ${JSON.stringify(kindleImport.json)}`);

    // 2. X Bookmarks Sync batch import
    const xImport = await jsonReq('/import/json', {
      method: 'POST',
      body: JSON.stringify([
        {
          title: 'Tweet from @sama',
          author: 'Sam Altman @sama',
          type: 'tweet',
          url: 'https://x.com/sama/status/1800000000',
          content: 'The most important thing is to focus on doing great work that matters.',
          note: 'Imported from X Bookmarks',
        },
      ]),
    });
    assert(xImport.status === 200 && xImport.json.totalImported === 1, `X bookmarks batch import failed: ${JSON.stringify(xImport.json)}`);

    // 3. Direct Highlighter endpoint with auto source creation
    const hlDirect = await jsonReq('/highlights', {
      method: 'POST',
      body: JSON.stringify({
        text: 'The best way to predict the future is to invent it.',
        url: 'https://example.com/future-computing',
        title: 'Future of Computing Essay',
      }),
    });
    assert(hlDirect.status === 201 && hlDirect.json.data?.id, `Highlighter direct creation failed: ${JSON.stringify(hlDirect.json)}`);
    assert(hlDirect.json.data.content === 'The best way to predict the future is to invent it.', 'Highlighter persisted correct text');

    // 4. In-browser Readability 1-click Save to /api/sources (pre-parsed content_html skips worker fetch)
    const clientSaved = await jsonReq('/sources', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Client Extracted Paywall Article',
        author: 'John Doe',
        type: 'article',
        url: 'https://private-intranet.invalid/article-1',
        content_html: '<p>Extracted on client with Readability to save worker CPU.</p>',
        word_count: 10,
        reading_time: 1,
        reading_status: 'later',
      }),
    });
    assert(clientSaved.status === 201 && clientSaved.json.data?.id, 'Direct pre-parsed source creation succeeds');
    assert(clientSaved.json.data.content_html.includes('Extracted on client with Readability'), 'Content stored without worker URL fetch');

    // 5. Highlight deduplication on same source
    const dupHl = await jsonReq('/highlights', {
      method: 'POST',
      body: JSON.stringify({
        text: 'The best way to predict the future is to invent it.',
        url: 'https://example.com/future-computing',
        title: 'Future of Computing Essay',
      }),
    });
    assert(dupHl.status === 200 && dupHl.json.data?.id === hlDirect.json.data.id, 'Duplicate highlight on source safely returned existing id');
  });

  // Cleanup test source/share
  await test('17. Cleanup test source & remaining share', async () => {
    if (sourceShareSlug) {
      await jsonReq(`/shares/${encodeURIComponent(sourceShareSlug)}`, { method: 'DELETE' });
    }
    if (createdSourceId) {
      await jsonReq(`/sources/${createdSourceId}`, { method: 'DELETE' });
    }
    assert(true, 'Cleanup complete');
  });

  console.log(`\n📊 Core Parity Summary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    throw new Error(`${failed} core parity test(s) failed`);
  }
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  runCoreParityTests().catch((err) => {
    console.error('Fatal runner error:', err);
    process.exit(1);
  });
}
