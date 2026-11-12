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

export default app;
