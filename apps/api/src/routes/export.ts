import { Hono } from 'hono';
import { Bindings, HighlightWithSource, SourceRow } from '../types';
import { createZipArchive, ZipEntryInput } from '../services/zip';

const app = new Hono<{ Bindings: Bindings }>();

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'Untitled';
}

function escapeYaml(val: string): string {
  return `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// GET /api/export/obsidian - Download Obsidian Vault .zip
app.get('/obsidian', async (c) => {
  const favoritesOnly = c.req.query('favoritesOnly') === '1';

  const { results: sources } = await c.env.DB.prepare(
    `SELECT * FROM sources WHERE deleted = 0 ORDER BY name ASC`
  ).all<SourceRow>();

  const { results: highlights } = await c.env.DB.prepare(`
    SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type, s.url as source_url,
      json_group_array(json_object('id', t.id, 'name', t.name, 'color', t.color)) as tags_json
    FROM highlights h
    JOIN sources s ON s.id = h.source_id
    LEFT JOIN highlight_tags ht ON ht.highlight_id = h.id
    LEFT JOIN tags t ON t.id = ht.tag_id
    WHERE h.deleted = 0 AND s.deleted = 0
    ${favoritesOnly ? 'AND h.favorite = 1' : ''}
    GROUP BY h.id
    ORDER BY h.created_at ASC
  `).all<HighlightWithSource & { tags_json: string }>();

  const highlightsBySource = new Map<string, Array<HighlightWithSource & { tagNames: string[] }>>();

  for (const hl of highlights) {
    let tagNames: string[] = [];
    try {
      const parsed = JSON.parse(hl.tags_json) as Array<{ id?: string; name?: string }>;
      tagNames = parsed
        .filter((t) => Boolean(t && t.id && t.name))
        .map((t) => t.name as string);
    } catch {
      tagNames = [];
    }
    const list = highlightsBySource.get(hl.source_id) || [];
    list.push({ ...hl, tagNames });
    highlightsBySource.set(hl.source_id, list);
  }

  const entries: ZipEntryInput[] = [];
  const usedPaths = new Set<string>();
  const indexLines: string[] = [
    '---',
    `exported_at: ${escapeYaml(new Date().toISOString())}`,
    `total_sources: ${sources.length}`,
    `total_highlights: ${highlights.length}`,
    '---',
    '',
    '# Mnema Obsidian Vault',
    '',
    '## Library Index',
    '',
  ];

  for (const src of sources) {
    const srcHighlights = highlightsBySource.get(src.id) || [];
    if (favoritesOnly && srcHighlights.length === 0) continue;

    const folder =
      src.type === 'book'
        ? 'Books'
        : src.type === 'youtube'
        ? 'YouTube'
        : src.type === 'pdf'
        ? 'PDFs'
        : 'Articles';

    let baseName = sanitizeFilename(src.name);
    let filePath = `Mnema Library/${folder}/${baseName}.md`;
    let suffix = 2;
    while (usedPaths.has(filePath)) {
      filePath = `Mnema Library/${folder}/${baseName} (${suffix}).md`;
      suffix++;
    }
    usedPaths.add(filePath);

    const allTags = new Set<string>(['mnema', src.type]);
    for (const h of srcHighlights) {
      h.tagNames.forEach((t) => allTags.add(t.replace(/\s+/g, '-')));
    }

    const mdLines: string[] = [
      '---',
      `title: ${escapeYaml(src.name)}`,
      src.author ? `author: ${escapeYaml(src.author)}` : null,
      `type: ${src.type}`,
      `status: ${src.reading_status}`,
      src.url ? `url: ${escapeYaml(src.url)}` : null,
      `highlights_count: ${srcHighlights.length}`,
      `tags: [${Array.from(allTags).join(', ')}]`,
      `updated: ${escapeYaml(src.updated_at)}`,
      '---',
      '',
      `# ${src.name}`,
      '',
      src.author ? `**Author:** [[${src.author}]]` : null,
      src.url ? `**Source URL:** ${src.url}` : null,
      '',
    ].filter((line): line is string => line !== null);

    if (src.source_notes && src.source_notes.trim()) {
      mdLines.push('## Synthesis & Source Notes', '', src.source_notes.trim(), '');
    }

    mdLines.push('## Highlights', '');

    if (srcHighlights.length === 0) {
      mdLines.push('_No highlights yet._', '');
    } else {
      for (const h of srcHighlights) {
        const quoteLines = h.content
          .split(/\r?\n/)
          .map((l) => `> ${l}`)
          .join('\n');
        mdLines.push(quoteLines);

        const metaParts: string[] = [];
        if (h.location) metaParts.push(`Location: ${h.location}`);
        if (h.favorite) metaParts.push('★ Favorite');
        if (h.tagNames.length > 0) {
          metaParts.push(h.tagNames.map((t) => `#${t.replace(/\s+/g, '-')}`).join(' '));
        }
        if (metaParts.length > 0) {
          mdLines.push(`> — *${metaParts.join(' · ')}*`);
        }
        mdLines.push('');

        if (h.note && h.note.trim()) {
          mdLines.push(`**Note:** ${h.note.trim()}`, '');
        }
        mdLines.push('---', '');
      }
    }

    entries.push({ path: filePath, content: mdLines.join('\n') });
    const linkName = filePath.replace(/^Mnema Library\//, '').replace(/\.md$/, '');
    indexLines.push(`- [[${linkName}|${src.name}]] (${srcHighlights.length} highlights)`);
  }

  entries.unshift({
    path: 'Mnema Library/Index.md',
    content: indexLines.join('\n'),
  });

  const zipBytes = createZipArchive(entries);

  return new Response(zipBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="mnema-obsidian-vault-${new Date().toISOString().slice(0, 10)}.zip"`,
      'Content-Length': String(zipBytes.byteLength),
    },
  });
});

export default app;
