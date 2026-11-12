import { Hono } from 'hono';
import { Bindings } from '../types';
import { OcrMode, runBookPageOcr } from '../services/ocr';
import { getSettings } from '../services/settings';

const app = new Hono<{ Bindings: Bindings }>();

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

interface WorkersAiTextResponse {
  response?: string;
}

async function resolveGeminiKey(env: Bindings, customApiKey?: string): Promise<string | undefined> {
  if (customApiKey?.trim()) return customApiKey.trim();
  if (env.GEMINI_API_KEY?.trim()) return env.GEMINI_API_KEY.trim();
  try {
    const settings = await getSettings(env.DB);
    return settings.gemini_api_key || undefined;
  } catch {
    return undefined;
  }
}

async function generateAIResponse(
  prompt: string,
  env: Bindings,
  customApiKey?: string
): Promise<string> {
  const apiKey = await resolveGeminiKey(env, customApiKey);

  if (apiKey) {
    const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    for (const model of models) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      if (res.ok) {
        const data = (await res.json()) as GeminiResponse;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      } else if (res.status !== 404) {
        break;
      }
    }
  }

  if (env.AI) {
    try {
      const aiRes = (await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [{ role: 'user', content: prompt }],
      })) as WorkersAiTextResponse;
      if (aiRes.response) return aiRes.response;
    } catch (e) {
      console.warn('Workers AI error:', e instanceof Error ? e.message : e);
    }
  }

  throw new Error(
    'No AI provider configured. Please provide a free Google Gemini API Key in Settings.'
  );
}

// POST /api/ai/cleanup - Cleans up OCR/text formatting
app.post('/cleanup', async (c) => {
  const body = (await c.req.json()) as { text?: string; apiKey?: string };
  const text = body.text?.trim();
  const apiKey = body.apiKey || c.req.header('X-Gemini-Key');

  if (!text) {
    return c.json({ error: 'Text is required' }, 400);
  }

  const prompt = `You are an expert text editor. Please clean up the following text by fixing OCR errors, broken line wraps, hyphenated words, and weird punctuation. Keep the original meaning and language exactly intact. Return ONLY the cleaned text:\n\n${text}`;

  try {
    const cleaned = await generateAIResponse(prompt, c.env, apiKey);
    return c.json({ data: { text: cleaned } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI cleanup failed';
    return c.json({ error: msg }, 500);
  }
});

// POST /api/ai/ocr - Extract quotes/text from a physical book page photo using Gemini Vision
app.post('/ocr', async (c) => {
  const body = (await c.req.json()) as {
    imageBase64?: string;
    mimeType?: string;
    mode?: OcrMode;
    apiKey?: string;
  };

  const apiKey = body.apiKey || c.req.header('X-Gemini-Key');
  if (!body.imageBase64?.trim()) {
    return c.json({ error: 'imageBase64 is required' }, 400);
  }

  try {
    const result = await runBookPageOcr(
      {
        imageBase64: body.imageBase64,
        mimeType: body.mimeType,
        mode: body.mode,
        customApiKey: apiKey,
      },
      c.env
    );
    return c.json({ data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OCR extraction failed';
    const status = msg.includes('Unsupported') || msg.includes('Invalid') || msg.includes('required') ? 400 : 500;
    return c.json({ error: msg }, status);
  }
});

// POST /api/ai/suggest-tags - Auto suggest 3-5 tags
app.post('/suggest-tags', async (c) => {
  const body = (await c.req.json()) as { content?: string; apiKey?: string };
  const content = body.content?.trim();
  const apiKey = body.apiKey || c.req.header('X-Gemini-Key');

  if (!content) {
    return c.json({ error: 'Content is required' }, 400);
  }

  const prompt = `Analyze this highlight or passage and return 3 to 5 short, relevant topic tags in JSON array format (e.g. ["philosophy", "productivity", "mindset"]). Output ONLY the JSON array:\n\n${content}`;

  try {
    const responseText = await generateAIResponse(prompt, c.env, apiKey);
    const match = responseText.match(/\[.*?\]/s);
    let tags: string[] = [];
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as unknown;
        if (Array.isArray(parsed)) {
          tags = parsed.filter((t): t is string => typeof t === 'string');
        }
      } catch {
        tags = [];
      }
    }
    return c.json({ data: { tags } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Tag suggestion failed';
    return c.json({ error: msg }, 500);
  }
});

// POST /api/ai/ask - AI Reader Copilot / Ask AI
app.post('/ask', async (c) => {
  const body = (await c.req.json()) as {
    question?: string;
    context?: string;
    apiKey?: string;
  };
  const question = body.question?.trim();
  const articleContext = body.context?.trim() || '';
  const apiKey = body.apiKey || c.req.header('X-Gemini-Key');

  if (!question) {
    return c.json({ error: 'Question is required' }, 400);
  }

  const prompt = `You are Mnema AI, an insightful personal reading assistant.
Based on the following reading material context:
"""
${articleContext.slice(0, 4000)}
"""

Please answer the user's question clearly, concisely, and thoughtfully:
"${question}"`;

  try {
    const answer = await generateAIResponse(prompt, c.env, apiKey);
    return c.json({ data: { answer } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI query failed';
    return c.json({ error: msg }, 500);
  }
});

// POST /api/ai/ask-highlight - Multi-turn conversation with AI about a highlight
app.post('/ask-highlight', async (c) => {
  const body = (await c.req.json()) as {
    threadId?: string;
    highlightId?: string;
    sourceId?: string;
    highlightContent?: string;
    sourceTitle?: string;
    question?: string;
    message?: string;
    apiKey?: string;
  };

  const question = (body.message || body.question || '').trim();
  const apiKey = body.apiKey || c.req.header('X-Gemini-Key');
  const highlightContent = body.highlightContent?.trim() || '';
  const sourceTitle = body.sourceTitle?.trim() || 'Untitled Source';

  if (!question) {
    return c.json({ error: 'Message or question is required' }, 400);
  }

  const now = new Date().toISOString();
  let threadId = body.threadId?.trim() || crypto.randomUUID();

  // Ensure thread exists in D1
  const existingThread = await c.env.DB.prepare('SELECT id FROM ai_threads WHERE id = ?').bind(threadId).first();
  if (!existingThread) {
    const titleSnippet = highlightContent ? highlightContent.slice(0, 60) + '...' : `Chat on ${sourceTitle}`;
    await c.env.DB.prepare(
      `INSERT INTO ai_threads (id, title, source_id, highlight_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(threadId, titleSnippet, body.sourceId || null, body.highlightId || null, now, now).run();
  }

  // Insert user message
  const userMsgId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO ai_messages (id, thread_id, role, content, created_at)
     VALUES (?, ?, 'user', ?, ?)`
  ).bind(userMsgId, threadId, question, now).run();

  // Fetch last 10-15 messages in chronological order
  const { results: recentRows } = await c.env.DB.prepare(
    `SELECT role, content FROM ai_messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT 15`
  ).bind(threadId).all<{ role: string; content: string }>();

  const history = (recentRows || []).slice().reverse();

  // Build multi-turn contextual prompt
  const historyText = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const prompt = `You are Mnema AI, an insightful personal reading assistant.
You are in a multi-turn conversation with the reader regarding this highlight:
"""
${highlightContent.slice(0, 3000)}
"""
From source: "${sourceTitle}"

Conversation History:
${historyText}

Please respond to the user's latest inquiry thoughtfully, clearly, and concisely. Keep the tone insightful, scholarly yet accessible.`;

  try {
    const answer = await generateAIResponse(prompt, c.env, apiKey);

    // Save assistant reply
    const assistantMsgId = crypto.randomUUID();
    const assistantNow = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO ai_messages (id, thread_id, role, content, created_at)
       VALUES (?, ?, 'assistant', ?, ?)`
    ).bind(assistantMsgId, threadId, answer, assistantNow).run();

    await c.env.DB.prepare('UPDATE ai_threads SET updated_at = ? WHERE id = ?').bind(assistantNow, threadId).run();

    return c.json({
      data: {
        threadId,
        answer,
        messages: [
          ...history,
          { role: 'assistant', content: answer },
        ],
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI query failed';
    return c.json({ error: msg }, 500);
  }
});

// GET /api/ai/threads?highlight_id=... - Retrieve most recent thread + messages for a highlight
app.get('/threads', async (c) => {
  const highlightId = c.req.query('highlight_id')?.trim();
  if (!highlightId) {
    return c.json({ error: 'highlight_id query parameter is required' }, 400);
  }

  const thread = await c.env.DB.prepare(
    'SELECT * FROM ai_threads WHERE highlight_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1'
  )
    .bind(highlightId)
    .first<any>();

  if (!thread) {
    return c.json({ data: null });
  }

  const { results: messages } = await c.env.DB.prepare(
    'SELECT id, role, content, created_at FROM ai_messages WHERE thread_id = ? ORDER BY created_at ASC'
  )
    .bind(thread.id)
    .all();

  return c.json({ data: { ...thread, messages } });
});

// GET /api/ai/threads/:id - Retrieve thread history
app.get('/threads/:id', async (c) => {
  const id = c.req.param('id');
  const thread = await c.env.DB.prepare('SELECT * FROM ai_threads WHERE id = ?').bind(id).first();
  if (!thread) {
    return c.json({ error: 'Thread not found' }, 404);
  }

  const { results: messages } = await c.env.DB.prepare(
    'SELECT id, role, content, created_at FROM ai_messages WHERE thread_id = ? ORDER BY created_at ASC'
  ).bind(id).all();

  return c.json({ data: { ...thread, messages } });
});

// POST /api/ai/inline-action - Lightweight Ghostreader Explain / Translate for selected text
app.post('/inline-action', async (c) => {
  const body = (await c.req.json()) as {
    action?: 'explain' | 'translate';
    text?: string;
    context?: string;
    targetLang?: 'vi' | 'en';
    apiKey?: string;
  };

  const action = body.action;
  const text = body.text?.trim();
  const context = body.context?.trim() || '';
  const apiKey = body.apiKey || c.req.header('X-Gemini-Key');

  if (action !== 'explain' && action !== 'translate') {
    return c.json({ error: 'action must be "explain" or "translate"' }, 400);
  }
  if (!text) {
    return c.json({ error: 'text is required' }, 400);
  }

  const clippedText = text.slice(0, 2000);
  const clippedContext = context.slice(0, 1200);

  let prompt: string;
  if (action === 'explain') {
    prompt = `You are Mnema Ghostreader, a concise reading assistant.
Explain the following selected passage clearly in 2-4 sentences. Clarify key concepts, jargon, or implied meaning without filler.${
      clippedContext ? `\n\nSurrounding context:\n"""\n${clippedContext}\n"""` : ''
    }\n\nSelected passage:\n"""\n${clippedText}\n"""`;
  } else {
    const langInstruction =
      body.targetLang === 'vi'
        ? 'Translate the following passage into natural Vietnamese.'
        : body.targetLang === 'en'
        ? 'Translate the following passage into natural English.'
        : 'Translate the following passage between Vietnamese and English: if it is in English, translate to natural Vietnamese; if it is in Vietnamese, translate to natural English; otherwise translate to natural English.';
    prompt = `${langInstruction} Return ONLY the translation.\n\nPassage:\n"""\n${clippedText}\n"""`;
  }

  try {
    const result = await generateAIResponse(prompt, c.env, apiKey);
    return c.json({ data: { action, result } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Inline AI action failed';
    return c.json({ error: msg }, 500);
  }
});

interface HighlightSampleRow {
  id: string;
  content: string;
  note: string | null;
  source_id: string;
  source_name: string;
  source_author: string | null;
  created_at: string;
  review_count: number;
}

interface TagSampleRow {
  id: string;
  name: string;
  color: string;
  count: number;
}

interface RawTopicCluster {
  title?: unknown;
  summary?: unknown;
  tags?: unknown;
  highlightIds?: unknown;
  reflectionPrompt?: unknown;
}

// POST /api/ai/discover-topics - Cluster user's tags and highlights into thematic connections
app.post('/discover-topics', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { apiKey?: string };
  const apiKey = body.apiKey || c.req.header('X-Gemini-Key');

  const [{ results: tagRows }, { results: recentRows }, { results: forgottenRows }] = await Promise.all([
    c.env.DB.prepare(
      `SELECT t.id, t.name, t.color, COUNT(ht.highlight_id) as count
       FROM tags t
       JOIN highlight_tags ht ON ht.tag_id = t.id
       JOIN highlights h ON h.id = ht.highlight_id AND h.deleted = 0
       GROUP BY t.id
       ORDER BY count DESC
       LIMIT 25`
    ).all<TagSampleRow>(),
    c.env.DB.prepare(
      `SELECT h.id, h.content, h.note, h.source_id, s.name as source_name, s.author as source_author, h.created_at, h.review_count
       FROM highlights h
       JOIN sources s ON s.id = h.source_id AND s.deleted = 0
       WHERE h.deleted = 0
       ORDER BY h.created_at DESC
       LIMIT 20`
    ).all<HighlightSampleRow>(),
    c.env.DB.prepare(
      `SELECT h.id, h.content, h.note, h.source_id, s.name as source_name, s.author as source_author, h.created_at, h.review_count
       FROM highlights h
       JOIN sources s ON s.id = h.source_id AND s.deleted = 0
       WHERE h.deleted = 0
       ORDER BY h.review_count ASC, h.created_at ASC
       LIMIT 15`
    ).all<HighlightSampleRow>(),
  ]);

  const highlightMap = new Map<string, HighlightSampleRow>();
  for (const row of [...(recentRows || []), ...(forgottenRows || [])]) {
    if (!highlightMap.has(row.id)) {
      highlightMap.set(row.id, row);
    }
  }
  const highlights = Array.from(highlightMap.values()).slice(0, 35);
  const tags = tagRows || [];

  if (highlights.length === 0) {
    return c.json({
      data: {
        clusters: [],
        highlightCount: 0,
        tagCount: tags.length,
        generatedAt: new Date().toISOString(),
      },
    });
  }

  const tagSummary =
    tags.length > 0
      ? tags.map((t) => `${t.name} (${t.count})`).join(', ')
      : 'No tags yet';

  const highlightLines = highlights
    .map((h) => {
      const snippet = h.content.replace(/\s+/g, ' ').trim().slice(0, 200);
      const notePart = h.note ? ` | Note: ${h.note.replace(/\s+/g, ' ').trim().slice(0, 80)}` : '';
      return `- [${h.id}] (${h.source_name}${h.source_author ? ` by ${h.source_author}` : ''}): "${snippet}"${notePart}`;
    })
    .join('\n');

  const clusterCount = highlights.length >= 6 ? '3 to 5' : '1 to 3';
  const prompt = `You are Mnema's Knowledge Graph Synthesis Assistant.
Analyze the reader's tags and highlights (which include both recent and older/forgotten highlights) and discover ${clusterCount} meaningful thematic clusters that surface hidden or forgotten connections across different sources.

Reader's Top Tags:
${tagSummary}

Highlights:
${highlightLines}

Return ONLY a valid JSON array (no markdown fences, no commentary) where each item has:
- "title": short, evocative theme title (3-7 words)
- "summary": 1-2 sentences explaining the unifying insight or forgotten connection
- "tags": array of 2-4 relevant short tag strings
- "highlightIds": array of 2-4 exact highlight IDs from the list above (use the exact UUID inside [brackets])
- "reflectionPrompt": one thought-provoking question for the reader to explore`;

  try {
    const responseText = await generateAIResponse(prompt, c.env, apiKey);
    const cleanedJson = responseText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const match = cleanedJson.match(/\[[\s\S]*\]/);

    let rawClusters: RawTopicCluster[] = [];
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as unknown;
        if (Array.isArray(parsed)) {
          rawClusters = parsed as RawTopicCluster[];
        }
      } catch {
        rawClusters = [];
      }
    }

    const clusters = rawClusters
      .map((item, idx) => {
        const title = typeof item.title === 'string' ? item.title.trim() : '';
        const summary = typeof item.summary === 'string' ? item.summary.trim() : '';
        const clusterTags = Array.isArray(item.tags)
          ? Array.from(
              new Set(
                item.tags
                  .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
                  .map((t) => t.trim())
              )
            ).slice(0, 5)
          : [];
        const ids = Array.isArray(item.highlightIds)
          ? Array.from(
              new Set(
                item.highlightIds.filter((id): id is string => typeof id === 'string' && highlightMap.has(id))
              )
            )
          : [];
        const matchedHighlights = ids
          .map((id) => highlightMap.get(id)!)
          .map((h) => ({
            id: h.id,
            content: h.content,
            note: h.note,
            source_id: h.source_id,
            source_name: h.source_name,
            source_author: h.source_author,
            created_at: h.created_at,
          }));
        const reflectionPrompt =
          typeof item.reflectionPrompt === 'string' ? item.reflectionPrompt.trim() : '';

        return {
          id: `cluster-${idx + 1}`,
          title,
          summary,
          tags: clusterTags,
          highlights: matchedHighlights,
          reflectionPrompt,
        };
      })
      .filter((cluster) => cluster.title && cluster.summary && cluster.highlights.length > 0)
      .slice(0, 5);

    return c.json({
      data: {
        clusters,
        highlightCount: highlights.length,
        tagCount: tags.length,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Topic discovery failed';
    return c.json({ error: msg }, 500);
  }
});

export default app;
