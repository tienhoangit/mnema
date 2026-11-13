import { Hono } from 'hono';
import { Bindings } from '../../types';
import { OcrMode, runBookPageOcr } from '../../services/ocr';
import { generateAIResponse } from './aiProvider';
import topicDiscoveryApp from './topicDiscovery';

const app = new Hono<{ Bindings: Bindings }>();

// Mount topic discovery router
app.route('/', topicDiscoveryApp);

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

export default app;
