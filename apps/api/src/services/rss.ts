import { safeFetch } from './urlSafety';

export interface ParsedFeedItem {
  title: string;
  url: string;
  author: string | null;
  publishedAt: string | null;
  contentHtml: string;
  summary: string;
  imageUrl: string | null;
}

export interface ParsedFeed {
  title: string;
  siteUrl: string | null;
  items: ParsedFeedItem[];
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTag(block: string, tagNames: string[]): string | null {
  for (const tag of tagNames) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i');
    const match = block.match(regex);
    if (match && match[1]) {
      return decodeXmlEntities(match[1]);
    }
  }
  return null;
}

function extractAtomLink(block: string): string | null {
  const linkTags = block.match(/<link\b[^>]*>/gi) || [];
  let fallback: string | null = null;

  for (const tag of linkTags) {
    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const relMatch = tag.match(/\brel=["']([^"']+)["']/i);
    const rel = relMatch?.[1]?.toLowerCase() || 'alternate';
    if (rel === 'alternate') {
      return decodeXmlEntities(hrefMatch[1]);
    }
    if (!fallback && rel !== 'self' && rel !== 'enclosure') {
      fallback = decodeXmlEntities(hrefMatch[1]);
    }
  }

  // Also check <link>url</link>
  const textLink = extractTag(block, ['link']);
  return textLink || fallback;
}

function extractImageFromBlock(block: string, html: string): string | null {
  const mediaMatch =
    block.match(/<media:(?:content|thumbnail)\b[^>]*\burl=["']([^"']+)["']/i) ||
    block.match(/<enclosure\b[^>]*type=["']image\/[^"']*["'][^>]*\burl=["']([^"']+)["']/i);
  if (mediaMatch?.[1]) return mediaMatch[1];

  const imgMatch = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return imgMatch?.[1] || null;
}

export function parseFeedXml(xmlText: string, feedUrl: string): ParsedFeed {
  const trimmed = xmlText.trim();
  const isAtom = /<feed[\s>]/i.test(trimmed) && !/<channel[\s>]/i.test(trimmed);

  if (isAtom) {
    const feedHeader = trimmed.split(/<entry[\s>]/i)[0] || trimmed;
    const feedTitle = stripTags(extractTag(feedHeader, ['title']) || '') || new URL(feedUrl).hostname;
    const siteUrl = extractAtomLink(feedHeader);

    const entryMatches = trimmed.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    const items: ParsedFeedItem[] = [];

    for (const entry of entryMatches) {
      const title = stripTags(extractTag(entry, ['title']) || 'Untitled');
      const link = extractAtomLink(entry);
      if (!link) continue;

      const authorBlock = extractTag(entry, ['author']);
      const author = authorBlock
        ? stripTags(extractTag(authorBlock, ['name']) || authorBlock)
        : null;

      const publishedAt = extractTag(entry, ['published', 'updated']);
      const contentRaw =
        extractTag(entry, ['content', 'summary']) || '';
      const contentHtml = contentRaw.includes('<')
        ? contentRaw
        : contentRaw
        ? `<p>${contentRaw}</p>`
        : '';

      items.push({
        title,
        url: link,
        author: author || null,
        publishedAt,
        contentHtml,
        summary: stripTags(contentRaw).slice(0, 220),
        imageUrl: extractImageFromBlock(entry, contentHtml),
      });
    }

    return { title: feedTitle, siteUrl, items };
  }

  // RSS 2.0 / RDF
  const channelHeader = trimmed.split(/<item[\s>]/i)[0] || trimmed;
  const feedTitle = stripTags(extractTag(channelHeader, ['title']) || '') || new URL(feedUrl).hostname;
  const siteUrl = extractTag(channelHeader, ['link']);

  const itemMatches = trimmed.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  const items: ParsedFeedItem[] = [];

  for (const item of itemMatches) {
    const title = stripTags(extractTag(item, ['title']) || 'Untitled');
    const link = extractTag(item, ['link', 'guid']);
    if (!link || !/^https?:\/\//i.test(link)) continue;

    const author =
      stripTags(extractTag(item, ['dc:creator', 'author']) || '') || null;
    const publishedAt = extractTag(item, ['pubDate', 'dc:date', 'published']);
    const contentRaw =
      extractTag(item, ['content:encoded', 'description', 'summary']) || '';
    const contentHtml = contentRaw.includes('<')
      ? contentRaw
      : contentRaw
      ? `<p>${contentRaw}</p>`
      : '';

    items.push({
      title,
      url: link,
      author,
      publishedAt,
      contentHtml,
      summary: stripTags(contentRaw).slice(0, 220),
      imageUrl: extractImageFromBlock(item, contentHtml),
    });
  }

  return { title: feedTitle, siteUrl, items };
}

export async function fetchAndParseFeed(feedUrl: string): Promise<ParsedFeed> {
  const { response: res, finalUrl } = await safeFetch(feedUrl, {
    headers: {
      'User-Agent': 'MnemaRSS/1.0 (+https://mnema.mnema.workers.dev)',
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch RSS feed: HTTP ${res.status}`);
  }

  const xml = await res.text();
  if (!xml.includes('<rss') && !xml.includes('<feed') && !xml.includes('<rdf:RDF') && !xml.includes('<channel')) {
    throw new Error('URL does not appear to be a valid RSS or Atom feed');
  }

  return parseFeedXml(xml, finalUrl);
}
