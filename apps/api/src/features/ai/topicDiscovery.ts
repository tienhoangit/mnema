import { Hono } from 'hono';
import { Bindings } from '../../types';
import { generateAIResponse } from './aiProvider';

const app = new Hono<{ Bindings: Bindings }>();

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
